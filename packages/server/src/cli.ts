#!/usr/bin/env node
// KaiBoard MCP server —— CLI 入口（local --dir 绑定）
// 用法：kaiboard-mcp --dir <文件夹>
import { createServer } from "./server.js";

function parseArgs(argv: string[]): { dir?: string } {
  const args: { dir?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") {
      args.dir = argv[++i];
    } else if (a.startsWith("--dir=")) {
      args.dir = a.slice("--dir=".length);
    }
  }
  return args;
}

const { dir } = parseArgs(process.argv.slice(2));
if (!dir) {
  process.stderr.write("usage: kaiboard-mcp --dir <文件夹>\n");
  process.exit(2);
}

createServer({ rootDir: dir }).start();
