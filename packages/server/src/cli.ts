#!/usr/bin/env node
// KaiBoard MCP server —— CLI 入口（统一包：--dir 离线 / --relay 共绘）
// 用法：
//   kaiboard-mcp --dir <文件夹>            离线模式，直接读写本地文件夹（无需开着 KaiBoard）
//   kaiboard-mcp --relay [--relay-url URL] 共绘模式，内建拥有本地中继，驱动运行中且「Agent 共绘」ON 的 KaiBoard
import { createServer } from "./server.js";

function parseArgs(argv: string[]): { dir?: string; relay?: string; mode?: "dir" | "relay" } {
  const args: { dir?: string; relay?: string; mode?: "dir" | "relay" } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") {
      args.dir = argv[++i];
      args.mode = "dir";
    } else if (a.startsWith("--dir=")) {
      args.dir = a.slice("--dir=".length);
      args.mode = "dir";
    } else if (a === "--relay") {
      args.relay = argv[++i] || "";
      args.mode = "relay";
    } else if (a.startsWith("--relay=")) {
      args.relay = a.slice("--relay=".length);
      args.mode = "relay";
    } else if (a === "--relay-url") {
      args.relay = argv[++i] || ""; // 仅设探测基址，不切换模式（--dir 模式的一致性探测用）
    } else if (a.startsWith("--relay-url=")) {
      args.relay = a.slice("--relay-url=".length);
    }
  }
  return args;
}

const { dir, relay, mode } = parseArgs(process.argv.slice(2));
if (!mode) {
  process.stderr.write(
    "usage:\n" +
      "  kaiboard-mcp --dir <文件夹>            # 离线模式\n" +
      "  kaiboard-mcp --relay [--relay-url URL] # 共绘模式（默认 http://127.0.0.1:8787）\n",
  );
  process.exit(2);
}
if (mode === "dir" && !dir) {
  process.stderr.write("usage: kaiboard-mcp --dir <文件夹>\n");
  process.exit(2);
}

createServer({ rootDir: dir, relayUrl: relay || undefined, mode }).start();
