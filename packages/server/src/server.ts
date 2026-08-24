// @kaiboard/mcp-server —— stdio JSON-RPC 2.0 MCP 服务端（local --dir 绑定）
// 复用 mcp-bridge.mjs 的 stdio 骨架，但补齐协议：9 命令 + listCapabilities（一等命令）、
// kbProtocol 协商（§2）、requestId 幂等（§3）、标准错误码（§8）。
// 所有命令经 @kaiboard/core 的 executeCommand 执行，存储由 fsStorageAdapter 注入。

import { createFsStorageAdapter } from "./fsStorageAdapter.js";
import { IdempotencyCache } from "./idempotency.js";
import {
  KB_PROTOCOL,
  SERVER_NAME,
  SERVER_VERSION,
  COMMANDS,
  negotiate,
  errorCodeFromCore,
  envelope,
  errorEnvelope,
  listCapabilitiesResult,
} from "./protocol.js";
import { executeCommand } from "@kaiboard/core";
import { randomUUID } from "node:crypto";
import type { AgentCmd, AgentCommand } from "@kaiboard/core";

function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

// 工具名采用 MCP 惯用的 snake_case：kaiboard_<cmd 的 snake 形式>（与 kaiboard_list_capabilities 一致）。
// 建立 工具名↔cmd 双向映射，dispatch 时直接用反向查表，避免字符串剥离的歧义。
const TOOL_TO_CMD: Record<string, AgentCmd> = Object.fromEntries(
  COMMANDS.map((cmd) => ["kaiboard_" + camelToSnake(cmd), cmd]),
);
const CMD_TO_TOOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_TO_CMD).map(([tool, cmd]) => [cmd, tool]),
);

function toolName(cmd: string): string {
  return CMD_TO_TOOL[cmd] ?? "kaiboard_" + camelToSnake(cmd);
}

const TOOLS = [
  ...COMMANDS.map((cmd) => ({
    name: toolName(cmd),
    description: `KaiBoard 共绘命令 ${cmd}（见 PROTOCOL-v2）。参数见各命令节。`,
    inputSchema: {
      type: "object",
      properties: {
        kbProtocol: { type: "string" },
        requestId: { type: "string" },
        token: { type: "string" },
        boardId: { type: "string" },
        elements: { type: "array" },
        patches: { type: "array" },
        ids: { type: "array" },
        name: { type: "string" },
        parentId: { type: "string" },
        mermaid: { type: "string" },
        source: { type: "object" },
        opts: { type: "object" },
      },
      required: ["requestId"],
    },
  })),
  {
    name: "kaiboard_list_capabilities",
    description: "KaiBoard 能力声明（一等命令）：可用命令白名单 / 存储模式 / 快照上限 / 服务端信息",
    inputSchema: {
      type: "object",
      properties: { kbProtocol: { type: "string" }, requestId: { type: "string" } },
      required: ["requestId"],
    },
  },
];

export function createServer(opts: { rootDir: string }) {
  const adapter = createFsStorageAdapter(opts.rootDir);
  const cache = new IdempotencyCache();
  let buf = "";
  let pending = 0;
  let stdinClosed = false;
  const write = (obj: any): void => {
    process.stdout.write(JSON.stringify(obj) + "\n");
  };
  const maybeExit = (): void => {
    if (stdinClosed && pending === 0) process.exit(0);
  };

  async function dispatchTool(name: string, args: any): Promise<any> {
    const requestId = args.requestId || randomUUID();
    const kbProtocol = args.kbProtocol || KB_PROTOCOL;

    if (name === "kaiboard_list_capabilities") {
      return envelope(kbProtocol, requestId, listCapabilitiesResult());
    }

    const cmd = TOOL_TO_CMD[name];
    if (!cmd) {
      return errorEnvelope(kbProtocol, requestId, "UNKNOWN_CMD", `unknown command ${name}`);
    }

    const neg = negotiate(kbProtocol);
    if (!neg.ok) return errorEnvelope(kbProtocol, requestId, neg.code, neg.message);

    const agentCmd: AgentCommand = {
      cmd,
      boardId: args.boardId,
      elements: args.elements,
      patches: args.patches,
      ids: args.ids,
      name: args.name,
      parentId: args.parentId,
      mermaid: args.mermaid,
      source: args.source,
      opts: args.opts,
    };

    // 幂等：同 requestId → 回放缓存，不重执行写操作
    return cache.run(requestId, async () => {
      const r = await executeCommand(adapter, () => {}, agentCmd);
      if (r.ok) return envelope(kbProtocol, requestId, r);
      return errorEnvelope(kbProtocol, requestId, errorCodeFromCore(r.error), String(r.error || ""));
    });
  }

  async function handle(msg: any): Promise<void> {
    pending++;
    try {
      const { id, method, params } = msg;
      if (method === "initialize") {
        write({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        });
      } else if (method === "notifications/initialized") {
        /* 无需回复 */
      } else if (method === "ping") {
        write({ jsonrpc: "2.0", id, result: {} });
      } else if (method === "tools/list") {
        write({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      } else if (method === "tools/call") {
        const name = params?.name;
        const args = params?.arguments || {};
        try {
          const result = await dispatchTool(name, args);
          write({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: JSON.stringify(result) }] },
          });
        } catch (e: any) {
          write({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e?.message || e) } });
        }
      } else {
        write({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } });
      }
    } finally {
      pending--;
      maybeExit();
    }
  }

  function start(): void {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          handle(JSON.parse(line));
        } catch {
          /* 忽略畸形行 */
        }
      }
    });
    process.stdin.on("end", () => {
      stdinClosed = true;
      maybeExit();
    });
  }

  return { start, _adapter: adapter, _cache: cache };
}
