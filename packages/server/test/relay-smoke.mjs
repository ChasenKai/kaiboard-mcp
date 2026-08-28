// 中继模式冒烟测试：启动 kaiboard-mcp --relay，验证
//  1) 内建中继在 127.0.0.1:8787 起来且 /info 返回令牌
//  2) MCP 握手（initialize + tools/list）返回 kbfs_* 工具
//  3) kbfs_list_capabilities 返回 activeStorageMode: "relay"
// 不依赖 KaiBoard 页面（命令执行需 app，此处只验传输层 + 能力声明）。
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "..", "dist", "cli.js");
const TOKEN = "test-relay-token-" + Date.now();

const child = spawn(process.execPath, [cli, "--relay"], {
  env: { ...process.env, KAIBOARD_TOKEN: TOKEN, BRIDGE_PORT: "8799" },
  stdio: ["pipe", "pipe", "pipe"],
});

const stdoutLines = [];
let buf = "";
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) stdoutLines.push(line);
  }
});
child.stderr.on("data", (d) => process.stderr.write("[relay-stderr] " + d));

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}
function waitFor(pred, timeout = 4000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const hit = stdoutLines.find(pred);
      if (hit) {
        clearInterval(iv);
        res(hit);
      } else if (Date.now() - t0 > timeout) {
        clearInterval(iv);
        rej(new Error("timeout waiting for MCP response"));
      }
    }, 30);
  });
}

let failed = false;
const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg);
    failed = true;
  } else {
    console.log("PASS:", msg);
  }
};

try {
  await new Promise((r) => setTimeout(r, 600));
  // 1) 中继 /info
  const infoRes = await fetch("http://127.0.0.1:8799/info");
  const info = await infoRes.json();
  assert(info.token === TOKEN, "/info returns the relay token we set");

  // 2) MCP 握手
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const init = await waitFor((l) => {
    try {
      const o = JSON.parse(l);
      return o.id === 1 && o.result?.serverInfo;
    } catch {
      return false;
    }
  });
  assert(JSON.parse(init).result.serverInfo.name === "kaiboard-mcp", "initialize returns serverInfo kaiboard-mcp");

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tl = await waitFor((l) => {
    try {
      const o = JSON.parse(l);
      return o.id === 2 && o.result?.tools;
    } catch {
      return false;
    }
  });
  const tools = JSON.parse(tl).result.tools;
  const names = tools.map((t) => t.name);
  assert(names.some((n) => n.startsWith("kbfs_")), "tools include kbfs_* (" + names.length + " tools)");
  assert(!names.some((n) => n.startsWith("kaiboard_")), "no legacy kaiboard_* tools");

  // 3) list_capabilities → relay mode
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "kbfs_list_capabilities", arguments: {} },
  });
  const caps = await waitFor((l) => {
    try {
      const o = JSON.parse(l);
      return o.id === 3 && o.result?.content;
    } catch {
      return false;
    }
  });
  const capsText = JSON.parse(caps).result.content[0].text;
  const capsObj = JSON.parse(capsText);
  assert(capsObj.result?.activeStorageMode === "relay", "list_capabilities reports activeStorageMode=relay");

  console.log(failed ? "\nRELAY SMOKE: FAIL" : "\nRELAY SMOKE: OK");
  child.kill("SIGTERM");
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error("ERROR:", e);
  child.kill("SIGTERM");
  process.exit(1);
}
