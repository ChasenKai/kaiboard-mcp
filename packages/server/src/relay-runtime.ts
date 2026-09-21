// @kaibuddy/kaiboard-mcp —— 内建本地中继（进程内，吸收原 bridge-relay.mjs + Companion）。
// 端点契约与 bridge-relay.mjs 完全一致：/info /state /cmd /resp，token 不匹配一律 403，/resp 轮询 20s 超时。
// 由统一 server 在 --relay 模式直接 startRelay() 拉起，无需 child_process、无需独立 exe。
// 仅监听 127.0.0.1；app 端 agentRelayClient.ts 零改动即可对接。

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const RELAY_DEFAULT_PORT = 8787;

/** 解析中继令牌：BRIDGE_TOKEN / KAIBOARD_TOKEN 优先；否则读 token 文件；都没有则随机生成并持久化。 */
export function resolveRelayToken(): string {
  if (process.env.BRIDGE_TOKEN) return process.env.BRIDGE_TOKEN;
  if (process.env.KAIBOARD_TOKEN) return process.env.KAIBOARD_TOKEN;
  const candidates = [
    path.join(__dirname, ".kaiboard-relay-token"),
    path.join(os.homedir(), ".kaiboard", ".kaiboard-relay-token"),
  ];
  for (const f of candidates) {
    try {
      if (fs.existsSync(f)) {
        const t = fs.readFileSync(f, "utf8").trim();
        if (t) return t;
      }
    } catch {
      /* ignore */
    }
  }
  const t = crypto.randomBytes(24).toString("hex");
  for (const f of candidates) {
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, t);
      break;
    } catch {
      /* ignore（如只读介质，下次重启重新生成） */
    }
  }
  return t;
}

export interface RelayHandle {
  url: string;
  token: string;
  port: number;
  close(): void;
}

/** 在进程内启动本地中继，返回 url / token / 关闭句柄。 */
export function startRelay(opts?: { port?: number; token?: string }): RelayHandle {
  const port = opts?.port || Number(process.env.BRIDGE_PORT || RELAY_DEFAULT_PORT);
  const TOKEN = opts?.token || resolveRelayToken();

  let pendingCmd: any = null;
  let pendingResp: any = null;
  /**
   * 命令路由：waiter 记录该页面「当前打开的画板」。
   * 派发带 boardId 的命令时优先给匹配的页面，避免被别的标签页接走。
   * board 为 null = 老版本页面未上报（向后兼容，走原有"先到先得"逻辑）。
   */
  type CmdWaiter = { fn: (c: any) => void; board: string | null };
  const cmdWaiters: CmdWaiter[] = [];
  const respWaiters: Array<(c: any) => void> = [];
  let lastFolder: string | null = null;
  // 连接探测：KaiBoard 页面（agentRelayClient）长轮询 GET /cmd 时刷新。
  // 用途：让 Agent 快查「用户是否正开着画板」，不必等 /resp 的 20s 超时才判断。
  let lastClientSeenAt: number | null = null;
  /** 判定页面在线的时间窗（ms）：覆盖一次 20s 长轮询周期 + 重连间隔。 */
  const CLIENT_SEEN_WINDOW_MS = 30000;

  function readBody(req: http.IncomingMessage, cb: (b: any) => void) {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try {
        cb(JSON.parse(d || "{}"));
      } catch {
        cb({});
      }
    });
  }
  function json(res: http.ServerResponse, obj: any) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  }
  function empty(res: http.ServerResponse) {
    res.writeHead(204);
    res.end();
  }

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // PNA（Chrome Private Network Access）：页面在公网 HTTPS 站点时访问 127.0.0.1 属「私有网络请求」，
    // Chrome 会发带 Access-Control-Request-Private-Network 的预检；缺本头会被浏览器整体拦掉，
    // 表现为「中继令牌自动获取失败」。本地 dev（页面也在 localhost）不触发，故此前未暴露。
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "", "http://localhost");
    if (req.method === "GET" && url.pathname === "/info") {
      json(res, { token: TOKEN, version: "1.3", port, folder: lastFolder });
      return;
    }
    if (req.method === "POST" && url.pathname === "/state") {
      readBody(req, (b) => {
        if (b && typeof b.folder === "string") lastFolder = b.folder;
        json(res, { ok: true, folder: lastFolder });
      });
      return;
    }
    if (url.searchParams.get("token") !== TOKEN) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    // GET /state = 查询「页面是否已连接」（Agent 侧快查用，需 token）。
    // 注：POST /state 语义不同（页面向中继上报当前文件夹），两者并存不冲突。
    if (req.method === "GET" && url.pathname === "/state") {
      const now = Date.now();
      const connected =
        cmdWaiters.length > 0 ||
        (lastClientSeenAt !== null && now - lastClientSeenAt < CLIENT_SEEN_WINDOW_MS);
      json(res, {
        connected,
        lastSeenAt: lastClientSeenAt,
        folder: lastFolder,
        waiters: cmdWaiters.length,
        // 每个等待中的页面各自打开着哪块板（null = 未上报的老版本页面）。
        // 用途：Agent 可判断「目标板是否正被某个页面打开」→ 走哪条写入路径、要不要提醒用户。
        waiterBoards: cmdWaiters.map((x) => x.board),
        windowMs: CLIENT_SEEN_WINDOW_MS,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/cmd") {
      readBody(req, (b) => {
        pendingCmd = b;
        // 路由：命令带 boardId 时，优先派发给「当前正打开这块板」的页面；
        // 没有匹配（或老页面未上报 board）则退回原有行为（取队首）。
        const want = b && typeof b.boardId === "string" && b.boardId ? b.boardId : null;
        let idx = want ? cmdWaiters.findIndex((x) => x.board === want) : -1;
        if (idx < 0) idx = 0;
        const w = cmdWaiters.length ? cmdWaiters.splice(idx, 1)[0] : undefined;
        // 根治：命令已被挂起的 waiter 取走时必须清空 pendingCmd。
        // 否则页面下一次 GET /cmd 会再次拿到同一条指令 → 被执行两次
        // （表现：addElement 产生重复 id 元素，历史上只能用 replaceBoard 幂等规避）。
        if (w) {
          pendingCmd = null;
          w.fn(b);
        }
        json(res, { ok: true });
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/cmd") {
      // 页面来长轮询取指令 = 用户正开着 KaiBoard
      lastClientSeenAt = Date.now();
      if (pendingCmd) {
        const c = pendingCmd;
        pendingCmd = null;
        json(res, c);
        return;
      }
      const t = setTimeout(() => {
        const i = cmdWaiters.indexOf(w);
        if (i >= 0) cmdWaiters.splice(i, 1);
        empty(res);
      }, 20000);
      // 页面在长轮询 URL 上上报自己当前打开的画板（?board=xxx），
      // 供 POST /cmd 按 boardId 路由。老版本页面不带此参数 → board=null，行为不变。
      const w: CmdWaiter = {
        fn: (c: any) => {
          clearTimeout(t);
          json(res, c);
        },
        board: url.searchParams.get("board") || null,
      };
      cmdWaiters.push(w);
      // 客户端断开（页面关闭/刷新）时立即清理 waiter，避免残留导致
      // 连接在页面已关闭后仍被误判为在线（原逻辑只在 20s 超时才清理）。
      req.on("close", () => {
        clearTimeout(t);
        const i = cmdWaiters.indexOf(w);
        if (i >= 0) cmdWaiters.splice(i, 1);
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/resp") {
      readBody(req, (b) => {
        pendingResp = b;
        const w = respWaiters.shift();
        // 同 ：响应已被 Agent 长轮询取走时必须清空 pendingResp，
        // 否则下一次 GET /resp 会重复消费同一条响应（Agent 拿到上一笔的结果）。
        if (w) {
          pendingResp = null;
          w(b);
        }
        json(res, { ok: true });
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/resp") {
      if (pendingResp) {
        const c = pendingResp;
        pendingResp = null;
        json(res, c);
        return;
      }
      const t = setTimeout(() => {
        const i = respWaiters.indexOf(w);
        if (i >= 0) respWaiters.splice(i, 1);
        empty(res);
      }, 20000);
      const w = (c: any) => {
        clearTimeout(t);
        json(res, c);
      };
      respWaiters.push(w);
      // 同上：Agent 侧断开时及时清理，避免 waiter 残留（资源泄漏）。
      req.on("close", () => {
        clearTimeout(t);
        const i = respWaiters.indexOf(w);
        if (i >= 0) respWaiters.splice(i, 1);
      });
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`[kaiboard-mcp] relay listening on http://127.0.0.1:${port}\n`);
    process.stderr.write(`[kaiboard-mcp] relay token: ${TOKEN}\n`);
    process.stderr.write(
      `[kaiboard-mcp] relay ready. Keep the KaiBoard page open with "Agent co-draw" enabled; the page verifies the token via /info and connects automatically.\n` +
        `[kaiboard-mcp] 中继已就绪。保持 KaiBoard 页面在浏览器中打开、并已启用「Agent 共绘」，页面会自动通过 /info 校验令牌并完成连接。\n`,
    );
  });

  return {
    url: `http://127.0.0.1:${port}`,
    token: TOKEN,
    port,
    close: () => {
      try {
        server.close();
      } catch {
        /* ignore */
      }
    },
  };
}
