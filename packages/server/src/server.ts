// @kaiboard/mcp-server —— 统一 MCP 服务端（stdio JSON-RPC 2.0）
// 双能力（Plan A #376，非互斥）：--relay（内建拥有本地中继，命令级转发到运行中 KaiBoard）可独立启用；
//   --dir（离线 FsStorageAdapter）为可叠加可选能力。两者可同时持有，命令按 args.storage 路由（默认 relay）。
// 工具名统一 kbfs_*（10 命令 + listCapabilities）。协议：kbProtocol 协商 / requestId 幂等 / 标准错误码。
// 所有 --dir 命令经 @kaiboard/core 的 executeCommand 执行；--relay 命令经 relay 转发到 app 端同款执行器。

import { createFsStorageAdapter } from "./fsStorageAdapter.js";
import { startRelay, type RelayHandle } from "./relay-runtime.js";
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
import { basename } from "node:path";
import type { AgentCmd, AgentCommand } from "@kaiboard/core";

function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

// 工具名采用 MCP 惯用的 snake_case：kbfs_<cmd 的 snake 形式>（kbfs = KaiBoard File-System 模式）。
// 前缀刻意区别于旧的 kaiboard-bridge（已退役，其工具名为 kaiboard_*，原驱动运行中的 KaiBoard app 中继），
// 避免与历史命名混淆。建立 工具名↔cmd 双向映射，dispatch 时直接用反向查表。
const TOOL_TO_CMD: Record<string, AgentCmd> = Object.fromEntries(
  COMMANDS.map((cmd) => ["kbfs_" + camelToSnake(cmd), cmd]),
);
const CMD_TO_TOOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_TO_CMD).map(([tool, cmd]) => [cmd, tool]),
);

function toolName(cmd: string): string {
  return CMD_TO_TOOL[cmd] ?? "kbfs_" + camelToSnake(cmd);
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
        metadata: { type: "object" },
        storage: { type: "string", enum: ["relay", "dir"], description: "可选：强制后端。默认 relay（若已启用）；dir=离线写盘（需 --dir 启动）。" },
      },
      required: [],
    },
  })),
  {
    name: "kbfs_list_capabilities",
    description: "KaiBoard 能力声明（一等命令）：可用命令白名单 / 存储模式 / 快照上限 / 服务端信息",
    inputSchema: {
      type: "object",
      properties: { kbProtocol: { type: "string" }, requestId: { type: "string" } },
      required: [],
    },
  },
];

/** 探测 KaiBoard 中继 /info 返回的当前文件夹名（best-effort，超时即放弃）。 */
async function probeRelayFolder(relayUrl: string): Promise<string | null> {
  const u = relayUrl.replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(`${u}/info`, { method: "GET", signal: ctrl.signal });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as any;
    return j && typeof j.folder === "string" && j.folder ? j.folder : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * M2-3① 配置一致性探测：--dir 末段（basename）应与 KaiBoard 当前文件夹一致。
 * 不一致 → Agent 写入的内容用户需显式导入才可见，给出明确行动指引（降级显式落板）。
 * 注：浏览器 FileSystemDirectoryHandle 不暴露真实路径，/info 只能给文件夹名，故比 basename。
 */
function computeDirWarnings(rootDir: string, relayFolder: string | null | undefined): string[] {
  const warnings: string[] = [];
  if (relayFolder && basename(rootDir) !== relayFolder) {
    warnings.push(
      `Agent 工作目录(--dir=${rootDir}) 与 KaiBoard 当前文件夹(${relayFolder}) 不一致：` +
        `Agent 写入的内容需用户在 KaiBoard 中显式导入才可见；` +
        `建议把 --dir 指向 KaiBoard 当前文件夹，或在 KaiBoard 设置里将存储文件夹设为同一目录。`,
    );
  }
  return warnings;
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

/** 构造发给中继 /cmd 的指令体（字段与 app 端 agentRelayClient 期望的 RelayCmd 对齐）。 */
function buildRelayBody(cmd: string, id: string, agentCmd: AgentCommand): any {
  return {
    id,
    cmd,
    boardId: agentCmd.boardId,
    elements: agentCmd.elements,
    patches: agentCmd.patches,
    ids: agentCmd.ids,
    name: agentCmd.name,
    parentId: agentCmd.parentId,
    mermaid: agentCmd.mermaid,
    source: agentCmd.source,
    opts: agentCmd.opts,
    // 注：app 端 relay 客户端当前不转发 metadata（setMetadata 为 --dir 专属），relay 模式返回 unsupported。
  };
}

/**
 * 命令级转发：POST 到 /cmd，长轮询 /resp 取回（按 id 匹配，20s 超时）。
 * 端点契约与 bridge-relay.mjs 完全一致，app 端零改动。
 */
async function postCommandAndWait(relayUrl: string, token: string, cmdBody: any): Promise<any> {
  const u = relayUrl.replace(/\/$/, "");
  const postRes = await fetch(`${u}/cmd?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cmdBody),
  });
  if (!postRes.ok) {
    if (postRes.status === 403) throw new Error("relay token mismatch (403)");
    throw new Error("relay /cmd POST failed: " + postRes.status);
  }
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const r = await fetch(`${u}/resp?token=${encodeURIComponent(token)}`, { method: "GET" });
    if (r.status === 200) {
      const body = (await r.json().catch(() => null)) as any;
      if (body && body.id === cmdBody.id) return body;
      // id 不匹配（并发响应错序）→ 继续轮询
    } else if (r.status !== 204) {
      throw new Error("relay /resp unexpected: " + r.status);
    }
    await sleep(150);
  }
  throw new Error("relay response timeout (20s)");
}

export function createServer(opts: { rootDir?: string; relayUrl?: string; relay: boolean }) {
  const cache = new IdempotencyCache();

  // --dir 为可叠加可选能力：传了 rootDir 就建 FsStorageAdapter（不依赖 relay 是否启用）。
  // --relay 为主路径：启用内建本地中继（吸收 Companion+bridge-relay）。
  const adapter = opts.rootDir ? createFsStorageAdapter(opts.rootDir) : null;
  let relay: RelayHandle | null = null;
  let relayUrl = opts.relayUrl || "http://127.0.0.1:8787";
  let relayToken: string | null = null;
  let relayStarted = false;
  if (opts.relay) {
    // 优先用 KAIBOARD_RELAY_URL 指定外部中继基址；令牌走 startRelay 的解析（BRIDGE_TOKEN/KAIBOARD_TOKEN/文件）。
    relay = startRelay({ token: process.env.BRIDGE_TOKEN || process.env.KAIBOARD_TOKEN || undefined });
    relayUrl = process.env.KAIBOARD_RELAY_URL || relay.url;
    relayToken = relay.token;
    relayStarted = true;
  }
  const relayProbe = probeRelayFolder(relayUrl); // 异步探测 KaiBoard 当前文件夹（M2-3①，仅 --dir 一致性告警用）
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

    if (name === "kbfs_list_capabilities") {
      const folder = relayStarted ? await relayProbe : null;
      const warnings = opts.rootDir ? computeDirWarnings(opts.rootDir, folder) : [];
      return envelope(
        kbProtocol,
        requestId,
        listCapabilitiesResult({
          relayFolder: folder,
          dirWarnings: warnings,
          storageMode: relayStarted ? "relay" : "dir",
          relayAvailable: relayStarted,
          dirAvailable: !!adapter,
        }),
      );
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
      metadata: args.metadata,
    };

    // 幂等：同 requestId → 回放缓存，不重执行写操作
    return cache.run(requestId, async () => {
      // Plan A #376 路由：默认 relay（若已启动），显式 storage="dir" 且 adapter 可用则走离线写盘；
      // 两者都不满足 → 明确报错，列出可用后端，便于 SKILL 侧决策。
      const useRelay = relayStarted && args.storage !== "dir";
      const useDir = !!adapter && (args.storage === "dir" || !relayStarted);
      if (useRelay) {
        try {
          const r = await postCommandAndWait(relayUrl, relayToken!, buildRelayBody(cmd, requestId, agentCmd));
          if (r && r.ok) return envelope(kbProtocol, requestId, r);
          return errorEnvelope(kbProtocol, requestId, errorCodeFromCore(r?.error), String(r?.error || "relay exec failed"));
        } catch (e: any) {
          return errorEnvelope(kbProtocol, requestId, "RELAY_FAILED", String(e?.message || e));
        }
      }
      if (useDir) {
        const r = await executeCommand(adapter!, () => {}, agentCmd);
        if (r.ok) return envelope(kbProtocol, requestId, r);
        return errorEnvelope(kbProtocol, requestId, errorCodeFromCore(r.error), String(r.error || ""));
      }
      const avail: string[] = [];
      if (relayStarted) avail.push("relay");
      if (adapter) avail.push("dir");
      return errorEnvelope(
        kbProtocol,
        requestId,
        "NO_BACKEND",
        `no available backend for storage=${args.storage || "default"}; available=[${avail.join(",")}]`,
      );
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
    // M2-3①：传了 --dir 即探测并告警（stderr），便于发现配置不一致（relay 模式也照常，因 relay 文件夹即探测源）。
    if (opts.rootDir) {
      relayProbe.then((folder) => {
        const w = computeDirWarnings(opts.rootDir!, folder);
        for (const m of w) process.stderr.write("[kaiboard-mcp] WARN: " + m + "\n");
      });
    }
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

  return { start, _adapter: adapter, _cache: cache, _relay: relay };
}
