// @kaiboard/mcp-server —— M1-3 本地 E2E
// (A) Core + fsStorageAdapter 直接驱动，断言 --dir 落盘即见（KaiBoard fs 布局）
// (B) 真·stdio MCP server 端到端：initialize / tools/list / listCapabilities /
//     createBoard + requestId 幂等回放 / kbProtocol 拒绝 / getScreenshot 不支持(R1)
//
// 运行：node packages/server/test/e2e.mjs  （需先 npm run build）

import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer as httpCreate } from "node:http";
import * as core from "@kaiboard/core";
import { createFsStorageAdapter } from "@kaiboard/mcp-server";

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

async function readBoard(root, id) {
  try {
    return JSON.parse(await fs.readFile(join(root, "kaiboard-data", "boards", id + ".json"), "utf8"));
  } catch {
    return null;
  }
}
async function readTree(root) {
  try {
    return JSON.parse(await fs.readFile(join(root, "kaiboard-data", "tree.json"), "utf8"));
  } catch {
    return [];
  }
}

async function partA() {
  console.log("\n[A] Core + fsStorageAdapter（--dir 落盘即见）");
  const root = await mkdtemp(join(tmpdir(), "kb-e2e-a-"));
  try {
    const adapter = createFsStorageAdapter(root);
    const run = (cmd, extra = {}) => core.executeCommand(adapter, () => {}, { cmd, ...extra });

    const c = await run("createBoard", { name: "测试画板" });
    check("createBoard 返回 boardId", !!c.boardId, JSON.stringify(c));
    const bid = c.boardId;

    const a = await run("addElement", { boardId: bid, elements: [RECT] });
    check("addElement added=1", a.ok && a.added === 1, JSON.stringify(a));
    let b = await readBoard(root, bid);
    check("落板即见：boards/<id>.json 已写", b && b.elements.length === 1, JSON.stringify(b?.elements?.length));
    check("写入元素 id 稳定(rect-1)", b?.elements?.[0]?.id === "rect-1");

    const p = await run("patchElement", { boardId: bid, patches: [{ id: "rect-1", fill: "red" }] });
    check("patchElement patched=1", p.ok && p.patched === 1, JSON.stringify(p));
    b = await readBoard(root, bid);
    check("patch 生效(fill=red)", b?.elements?.[0]?.fill === "red", JSON.stringify(b?.elements?.[0]));

    const d = await run("deleteElement", { boardId: bid, ids: ["rect-1"] });
    check("deleteElement deleted=1", d.ok && d.deleted === 1, JSON.stringify(d));
    b = await readBoard(root, bid);
    check("删除后画板为空", b?.elements?.length === 0);

    const r = await run("replaceBoard", { boardId: bid, elements: [ELL] });
    check("replaceBoard replaced=1", r.ok && r.replaced === 1, JSON.stringify(r));
    b = await readBoard(root, bid);
    check("replace 后元素为 ellipse", b?.elements?.[0]?.type === "ellipse");

    const snap = await adapter.getSetting(core.SNAPSHOT_KEY, []);
    check("replaceBoard 自动快照(≤20)", Array.isArray(snap) && snap.length >= 1, JSON.stringify(snap?.length));

    const lb = await run("listBoards");
    check("listBoards 含该画板节点", lb.ok && lb.nodes.some((n) => n.id === bid));
    const tree = await readTree(root);
    check("tree.json 含该节点(落板即见)", tree.some((n) => n.id === bid));

    const gb = await run("getBoard", { boardId: bid });
    check("getBoard 返回元素", gb.ok && gb.elements.length === 1);

    // M2-2 setMetadata：画板级元数据写回 tree.json FileNode
    const sm = await run("setMetadata", {
      boardId: bid,
      metadata: { status: "done", version: 3, history: [{ ts: Date.now(), version: 3, note: "M2-2 e2e" }] },
    });
    check("setMetadata ok", sm.ok && sm.boardId === bid, JSON.stringify(sm));
    let tree2 = await readTree(root);
    const node2 = tree2.find((n) => n.id === bid);
    check("tree.json 节点写入 status=done", node2?.status === "done", JSON.stringify(node2));
    check("tree.json 节点写入 version=3", node2?.version === 3, JSON.stringify(node2));
    check("tree.json 节点写入 history[0].note", node2?.history?.[0]?.note === "M2-2 e2e", JSON.stringify(node2?.history));
    const readMeta = await adapter.getMetadata(bid);
    check("getMetadata 读回 status/version/history", readMeta?.status === "done" && readMeta?.version === 3 && readMeta?.history?.length === 1, JSON.stringify(readMeta));
    // 缺 boardId 在无当前画板的 --dir 模式应报错（而非静默成功）
    const smMissing = await run("setMetadata", { metadata: { status: "x" } });
    check("setMetadata 缺 boardId(--dir)→ok:false", smMissing.ok === false, JSON.stringify(smMissing));

    const layout = await fs.stat(join(root, "kaiboard-data", "tree.json"));
    check("文件系统布局：kaiboard-data/tree.json 存在", layout.isFile());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function startServer(dir, relayUrl) {
  const args = [join("packages", "server", "dist", "cli.js"), "--dir", dir];
  if (relayUrl) args.push("--relay-url", relayUrl); // 仅作一致性探测基址，不切换模式
  const child = spawn(process.execPath, args, {
    stdio: ["pipe", "pipe", "inherit"],
  });
  let buf = "";
  const waiters = new Map();
  let nextId = 1;
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && waiters.has(msg.id)) {
          const w = waiters.get(msg.id);
          waiters.delete(msg.id);
          w(msg);
        }
      } catch {}
    }
  });
  function rpc(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      waiters.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  async function callTool(name, args) {
    const res = await rpc("tools/call", { name, arguments: args });
    const text = res?.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : res;
  }
  return { child, rpc, callTool };
}

async function partB() {
  console.log("\n[B] 真·stdio MCP server 端到端");
  const root = await mkdtemp(join(tmpdir(), "kb-e2e-b-"));
  const srv = startServer(root);
  try {
    const init = await srv.rpc("initialize", {});
    check("initialize 返回 MCP 2024-11-05", init?.result?.protocolVersion === "2024-11-05", JSON.stringify(init?.result));

    const tl = await srv.rpc("tools/list", {});
    check("tools/list 返回 11 个 tool(10命令+listCapabilities)", tl?.result?.tools?.length === 11, JSON.stringify(tl?.result?.tools?.length));

    const cap = await srv.callTool("kbfs_list_capabilities", { requestId: "cap-1" });
    check("listCapabilities: commands 含 10 命令", cap.ok && cap.result.commands.length === 10, JSON.stringify(cap?.result?.commands));
    check("listCapabilities: storageModes 含 dir", cap.result.storageModes.includes("dir"));

    const c1 = await srv.callTool("kbfs_create_board", { requestId: "R1", name: "服务端画板" });
    check("server createBoard 返回 boardId", c1.ok && !!c1.result.boardId, JSON.stringify(c1));
    const bid = c1.result.boardId;

    // 幂等：同 requestId R1 再发一次 → 回放，不重执行（tree 节点数不变）
    const treeBefore = (await readTree(root)).length;
    const c1b = await srv.callTool("kbfs_create_board", { requestId: "R1", name: "服务端画板" });
    const treeAfter = (await readTree(root)).length;
    check("requestId 幂等：同 R1 回放、tree 节点不翻倍", c1b.ok && treeAfter === treeBefore && treeAfter === 1, `before=${treeBefore} after=${treeAfter}`);

    const bad = await srv.callTool("kbfs_get_board", { requestId: "R2", kbProtocol: "0.9.0", boardId: bid });
    check("kbProtocol 协商拒绝→PROTOCOL_UNSUPPORTED", bad.ok === false && bad.error?.code === "PROTOCOL_UNSUPPORTED", JSON.stringify(bad));

    // 先种一个元素使画板非空：空板 getScreenshot 返回 empty:true 属正常成功（无需渲染），
    // 只有「非空板 + 无 canvas(--dir)」才应回 EXEC_FAILED(screenshot unsupported)，这才是 R1 要验的路径。
    const seed = await srv.callTool("kbfs_add_element", {
      requestId: "R0",
      boardId: bid,
      elements: [{ type: "rectangle", id: "rect-seed", x: 0, y: 0, width: 100, height: 50 }],
    });
    check("server addElement(seed) 通过协议信封返回", seed.ok && seed.result.added === 1, JSON.stringify(seed));

    const shot = await srv.callTool("kbfs_get_screenshot", { requestId: "R3", boardId: bid });
    check("getScreenshot 在 --dir 非空板返回 unsupported(R1)", shot.ok === false, JSON.stringify(shot));

    const add = await srv.callTool("kbfs_add_element", { requestId: "R4", boardId: bid, elements: [RECT] });
    check("server addElement 通过协议信封返回", add.ok && add.result.added === 1, JSON.stringify(add));

    // M2-2 setMetadata：经 kbfs_set_metadata 工具写回 tree.json 节点元数据
    const sm = await srv.callTool("kbfs_set_metadata", { requestId: "R5", boardId: bid, metadata: { status: "review", version: 2 } });
    check("server setMetadata ok:true", sm.ok && sm.result.ok === true, JSON.stringify(sm));
    const treeAfterMeta = await readTree(root);
    const nodeMeta = treeAfterMeta.find((n) => n.id === bid);
    check("server setMetadata 写回 tree.json(status=review,version=2)", nodeMeta?.status === "review" && nodeMeta?.version === 2, JSON.stringify(nodeMeta));
  } finally {
    srv.child.kill();
    await rm(root, { recursive: true, force: true });
  }
}

async function startFakeRelay(folderName) {
  const srv = httpCreate((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: "test-token", version: "1.2", port: 0, folder: folderName }));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  return { url: `http://127.0.0.1:${port}`, close: () => srv.close() };
}

async function partC() {
  console.log("\n[C] M2-3① 配置一致性探测（--dir 与 relay /info.folder 比对）");
  // 一致：--dir 末段 == folder → 无告警
  {
    const relay = await startFakeRelay("KaiBoardFolder");
    const root = await mkdtemp(join(tmpdir(), "kb-e2e-c1-"));
    const matchDir = join(root, "KaiBoardFolder");
    await fs.mkdir(matchDir, { recursive: true });
    const srv = startServer(matchDir, relay.url);
    try {
      await srv.rpc("initialize", {});
      const cap = await srv.callTool("kbfs_list_capabilities", { requestId: "c1" });
      check("relayFolder 透传", cap.ok && cap.result.relayFolder === "KaiBoardFolder", JSON.stringify(cap?.result?.relayFolder));
      check("一致(--dir末段==folder)→dirWarnings 为空", Array.isArray(cap.result.dirWarnings) && cap.result.dirWarnings.length === 0, JSON.stringify(cap?.result?.dirWarnings));
    } finally {
      srv.child.kill();
      await relay.close();
      await rm(root, { recursive: true, force: true });
    }
  }
  // 不一致：--dir 末段 != folder → 有告警且含行动指引
  {
    const relay = await startFakeRelay("KaiBoardFolder");
    const root = await mkdtemp(join(tmpdir(), "kb-e2e-c2-"));
    const otherDir = join(root, "OtherFolder");
    await fs.mkdir(otherDir, { recursive: true });
    const srv = startServer(otherDir, relay.url);
    try {
      await srv.rpc("initialize", {});
      const cap = await srv.callTool("kbfs_list_capabilities", { requestId: "c2" });
      check("不一致(--dir末段!=folder)→dirWarnings 非空", cap.ok && Array.isArray(cap.result.dirWarnings) && cap.result.dirWarnings.length >= 1, JSON.stringify(cap?.result?.dirWarnings));
      check("告警含「显式导入才可见」行动指引", cap.result.dirWarnings.some((w) => w.includes("显式导入才可见")), JSON.stringify(cap?.result?.dirWarnings));
    } finally {
      srv.child.kill();
      await relay.close();
      await rm(root, { recursive: true, force: true });
    }
  }
  // relay 不可达 → 无告警（静默，不阻塞）
  {
    const root = await mkdtemp(join(tmpdir(), "kb-e2e-c3-"));
    const srv = startServer(root, "http://127.0.0.1:1");
    try {
      await srv.rpc("initialize", {});
      const cap = await srv.callTool("kbfs_list_capabilities", { requestId: "c3" });
      check("relay 不可达→relayFolder=null 且无告警", cap.ok && cap.result.relayFolder === null && cap.result.dirWarnings.length === 0, JSON.stringify(cap?.result));
    } finally {
      srv.child.kill();
      await rm(root, { recursive: true, force: true });
    }
  }
}

console.log("=== KaiBoard-MCP M1-3 E2E ===");
await partA();
await partB();
await partC();
console.log(`\n结果：PASS=${pass}  FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
