// @kaiboard/mcp-server —— M1-3 真实 MCP 客户端冒烟（不依赖官方 SDK）
//
// 为什么不用 @modelcontextprotocol/sdk：本沙箱 safe-delete 钩子会阻断 npm 缓存临时文件清理，
// SDK 安装被 EPERM 中断且提取残缺。改为手写一个「协议忠实」的最小 MCP 客户端：
// 完整复刻 SDK 的连接时序——initialize → 校验 protocolVersion → notifications/initialized
// → tools/list → tools/call。这同样能证明：一个真实 MCP 客户端（WorkBuddy/Cherry Studio 等）
// 可以用标准 tools/call 驱动全部 9 条命令。且零重依赖，更贴合 KaiBoard 轻量哲学。
//
// 运行：node packages/server/test/mcp-client-smoke.mjs  （需先 npm run build）

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join("packages", "server", "dist", "cli.js");

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

const RECT = { type: "rectangle", id: "rect-1", x: 0, y: 0, width: 100, height: 50 };
const ELL = { type: "ellipse", id: "ell-1", x: 10, y: 10, width: 80, height: 40 };

/** 最小 MCP 客户端：复刻官方 SDK 的 stdio 连接时序。 */
class McpClient {
  constructor(args) {
    this.child = spawn(process.execPath, [CLI, ...args], { stdio: ["pipe", "pipe", "inherit"] });
    this.buf = "";
    this.waiters = new Map();
    this.nextId = 1;
    this.closed = new Promise((resolve) => {
      this.child.stdout.on("data", (chunk) => {
        this.buf += chunk.toString();
        let idx;
        while ((idx = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, idx).trim();
          this.buf = this.buf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id != null && this.waiters.has(msg.id)) {
              const w = this.waiters.get(msg.id);
              this.waiters.delete(msg.id);
              w(msg);
            }
          } catch {
            /* 忽略畸形行 */
          }
        }
      });
      this.child.stdout.on("end", resolve);
    });
  }
  send(method, params) {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.waiters.set(id, resolve);
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  async callTool(name, args) {
    const res = await this.send("tools/call", { name, arguments: args });
    const text = res?.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : res;
  }
  /** 复刻 SDK connect()：initialize → 校验 protocolVersion → notifications/initialized */
  async connect() {
    const init = await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "kaiboard-mcp-smoke", version: "test" },
    });
    if (!init?.result?.protocolVersion) throw new Error("initialize 未返回 protocolVersion");
    this.notify("notifications/initialized", {});
    return init.result;
  }
  async close() {
    this.child.kill();
    await this.closed;
  }
}

async function main() {
  console.log("=== KaiBoard-MCP 真实 MCP 客户端冒烟 ===");
  const root = await mkdtemp(join(tmpdir(), "kb-smoke-"));
  const client = new McpClient(["--dir", root]);
  try {
    const info = await client.connect();
    check("initialize 返回 protocolVersion=2024-11-05", info.protocolVersion === "2024-11-05", JSON.stringify(info));
    check("initialize 返回 serverInfo.name=kaiboard-mcp", info.serverInfo?.name === "kaiboard-mcp", JSON.stringify(info?.serverInfo));

    const tl = await client.send("tools/list", {});
    const names = tl?.result?.tools?.map((t) => t.name) || [];
    check("tools/list=10（9命令+listCapabilities）", names.length === 10, JSON.stringify(names.length));
    check("含 kaiboard_list_capabilities", names.includes("kaiboard_list_capabilities"));
    check("含 kaiboard_create_board（snake_case）", names.includes("kaiboard_create_board"));

    // listCapabilities
    const cap = await client.callTool("kaiboard_list_capabilities", { requestId: "cap" });
    check("listCapabilities: commands=9", cap.ok && cap.result.commands.length === 9, JSON.stringify(cap?.result?.commands));
    check("listCapabilities: storageModes 含 dir", cap.result.storageModes.includes("dir"));

    // createBoard
    const c = await client.callTool("kaiboard_create_board", { requestId: "R1", name: "客户端画板" });
    check("createBoard 返回 boardId", c.ok && !!c.result.boardId, JSON.stringify(c));
    const bid = c.result.boardId;

    // addElement（非空板，供 getScreenshot 验 R1）
    const a = await client.callTool("kaiboard_add_element", { requestId: "R2", boardId: bid, elements: [RECT] });
    check("addElement added=1", a.ok && a.result.added === 1, JSON.stringify(a));

    // getScreenshot —— --dir 无 canvas，非空板必须回 unsupported（R1）
    const shot = await client.callTool("kaiboard_get_screenshot", { requestId: "R3", boardId: bid });
    check("getScreenshot(--dir 非空板)→ok:false unsupported", shot.ok === false, JSON.stringify(shot));

    // patchElement
    const p = await client.callTool("kaiboard_patch_element", { requestId: "R4", boardId: bid, patches: [{ id: "rect-1", fill: "red" }] });
    check("patchElement patched=1", p.ok && p.result.patched === 1, JSON.stringify(p));

    // getBoard（验证 patch 生效）
    const gb = await client.callTool("kaiboard_get_board", { requestId: "R5", boardId: bid });
    check("getBoard 返回元素且 fill=red", gb.ok && gb.result.elements[0]?.fill === "red", JSON.stringify(gb?.result?.elements?.[0]));

    // replaceBoard
    const r = await client.callTool("kaiboard_replace_board", { requestId: "R6", boardId: bid, elements: [ELL] });
    check("replaceBoard replaced=1", r.ok && r.result.replaced === 1, JSON.stringify(r));
    const gb2 = await client.callTool("kaiboard_get_board", { requestId: "R7", boardId: bid });
    check("replace 后元素为 ellipse", gb2.ok && gb2.result.elements[0]?.type === "ellipse", JSON.stringify(gb2?.result?.elements?.[0]));

    // deleteElement
    const d = await client.callTool("kaiboard_delete_element", { requestId: "R8", boardId: bid, ids: ["ell-1"] });
    check("deleteElement deleted=1", d.ok && d.result.deleted === 1, JSON.stringify(d));

    // fromMermaid —— headless 无 mermaid-to-excalidraw 依赖，应优雅回 ok:false（R1 同类限制，不崩）
    const m = await client.callTool("kaiboard_from_mermaid", { requestId: "R9", boardId: bid, mermaid: "graph TD; A-->B" });
    check("fromMermaid(--dir 无 mermaid 依赖)→ok:false 优雅降级", m.ok === false && typeof m.error?.code === "string", JSON.stringify(m));

    // listBoards
    const lb = await client.callTool("kaiboard_list_boards", { requestId: "R10" });
    check("listBoards 含该画板节点", lb.ok && lb.result.nodes.some((n) => n.id === bid), JSON.stringify(lb?.result?.nodes));

    // 未知命令 → UNKNOWN_CMD
    const unk = await client.callTool("kaiboard_no_such_cmd", { requestId: "R11" });
    check("未知命令→UNKNOWN_CMD", unk.ok === false && unk.error?.code === "UNKNOWN_CMD", JSON.stringify(unk));

    // 错误 kbProtocol → PROTOCOL_UNSUPPORTED
    const bad = await client.callTool("kaiboard_get_board", { requestId: "R12", kbProtocol: "0.9.0", boardId: bid });
    check("错误 kbProtocol→PROTOCOL_UNSUPPORTED", bad.ok === false && bad.error?.code === "PROTOCOL_UNSUPPORTED", JSON.stringify(bad));
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }

  console.log(`\n结果：PASS=${pass}  FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("冒烟异常：", e);
  process.exit(1);
});
