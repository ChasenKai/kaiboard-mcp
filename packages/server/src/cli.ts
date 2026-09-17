#!/usr/bin/env node
// KaiBoard MCP server —— CLI 入口（统一包：--relay 共绘为主，--dir 离线可叠加）
// 设计原则：MCP 配置固定，不随使用场景切换。
//   kaiboard-mcp --relay [--dir <文件夹>] [--relay-url URL]   # 共绘（默认 http://127.0.0.1:8787），--dir 可叠加为可选离线能力
//   kaiboard-mcp --dir <文件夹>                              # 仅离线（兼容旧用法）
import { createServer } from "./server.js";

function parseArgs(argv: string[]): { dir?: string; relayUrl?: string; relay: boolean } {
  const args: { dir?: string; relayUrl?: string; relay: boolean } = { relay: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") {
      args.dir = argv[++i];
    } else if (a.startsWith("--dir=")) {
      args.dir = a.slice("--dir=".length);
    } else if (a === "--relay" || a.startsWith("--relay=")) {
      // --relay 启用共绘主路径（后接 =URL 时为探测基址，可选）；不消费后续参数，避免与 --dir 互斥切换
      if (a.startsWith("--relay=")) args.relayUrl = a.slice("--relay=".length);
      args.relay = true;
    } else if (a === "--relay-url") {
      args.relayUrl = argv[++i] || ""; // 仅设探测基址，不切换模式
    } else if (a.startsWith("--relay-url=")) {
      args.relayUrl = a.slice("--relay-url=".length);
    }
  }
  return args;
}

const { dir, relayUrl, relay } = parseArgs(process.argv.slice(2));
if (!relay && !dir) {
  process.stderr.write(
    "usage:\n" +
      "  kaiboard-mcp --relay [--dir <folder>] [--relay-url URL]\n" +
      "      Drive a running KaiBoard page (relay defaults to http://127.0.0.1:8787); --dir may be combined.\n" +
      "      驱动运行中的 KaiBoard 页面（中继默认 http://127.0.0.1:8787）；可叠加 --dir。\n" +
      "  kaiboard-mcp --dir <folder>\n" +
      "      Work offline against a local folder.\n" +
      "      仅离线模式，绑定本地文件夹。\n",
  );
  process.exit(2);
}
if (dir && !dir.trim()) {
  process.stderr.write("usage: --dir requires a folder path ／ --dir 需要一个文件夹路径\n");
  process.exit(2);
}

createServer({ rootDir: dir, relayUrl: relayUrl || undefined, relay }).start();
