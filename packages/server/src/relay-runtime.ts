// @kaiboard/mcp-server —— 内建本地中继（进程内，吸收原 bridge-relay.mjs + Companion）。
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
  const cmdWaiters: Array<(c: any) => void> = [];
  const respWaiters: Array<(c: any) => void> = [];
  let lastFolder: string | null = null;

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
    if (req.method === "POST" && url.pathname === "/cmd") {
      readBody(req, (b) => {
        pendingCmd = b;
        const w = cmdWaiters.shift();
        if (w) w(b);
        json(res, { ok: true });
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/cmd") {
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
      const w = (c: any) => {
        clearTimeout(t);
        json(res, c);
      };
      cmdWaiters.push(w);
      return;
    }
    if (req.method === "POST" && url.pathname === "/resp") {
      readBody(req, (b) => {
        pendingResp = b;
        const w = respWaiters.shift();
        if (w) w(b);
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
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`[kaiboard-mcp] relay listening on http://127.0.0.1:${port}\n`);
    process.stderr.write(`[kaiboard-mcp] relay token: ${TOKEN}\n`);
    process.stderr.write(
      `[kaiboard-mcp] 在 KaiBoard「Agent 共绘」设置里复制此令牌（或直接依赖 app 自动从 /info 发现）即完成授权。\n`,
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
