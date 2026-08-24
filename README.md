# KaiBoard-MCP（本地开发工作区）

KaiBoard 的 **MCP 服务端**独立仓库（对应 app 仓 `ChasenKai/KaiBoard`）。
按 2026-08-24 架构决策：MCP 服务端 **独立仓库、独立版本号**，类 Excalidraw（`@excalidraw/excalidraw` 核心包 + `mcp-excalidraw` 另立仓库）模式。

> **开发纪律（不碰 GitHub 铁律）**：本目录目前是 **本地工作区**，仅做本地验证。
> 直到正式发布才 `git init` 远端 / push 到 `ChasenKai/KaiBoard-MCP`。
> 开发期所有改动都在本机，不触 GitHub。

## 结构

```
KaiBoard-MCP/
├── package.json          # npm workspaces 根（private）
├── tsconfig.base.json     # 共享编译配置
├── packages/
│   └── core/              # @kaiboard/core —— 存储无关的 Agent 指令核心（M1-2b 已落地）
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types.ts       # StorageAdapter 接口 + 9 命令类型 + BoardData/FileNode（包内自包含）
│           ├── elements.ts    # 元素处理（genElementId/normalizeIncoming/offsetBelow）
│           ├── snapshot.ts    # 快照栈（≤20，失败不阻断）
│           ├── mermaid.ts     # Mermaid → Excalidraw 图元（动态 import，peer 依赖）
│           ├── executor.ts    # 9 命令执行器（纯逻辑，全走 StorageAdapter）
│           ├── shims.d.ts     # 动态 import 的 @excalidraw/* 类型占位
│           └── index.ts       # 桶导出
└── (M1-3) packages/server/  # MCP 传输层 + --dir fsStorageAdapter，复用 @kaiboard/core
```

## 版本

- `kbProtocol` **跟随本仓库版本号**起步 `1.0.0`（不单列第三根版本轴）。
- app 仓版本（KaiBoard app）是另一根独立轴。

## 本地验证

```bash
npm install          # 安装 workspaces + typescript/@types/node（dev only）
npm run typecheck   # 仅类型检查 @kaiboard/core（noEmit）
npm run build       # 构建 @kaiboard/core + @kaiboard/mcp-server 到各自 dist/
npm run e2e         # partA(Core+fsAdapter 直驱) + partB(真·stdio server) 端到端
npm run smoke       # 真实 MCP 客户端冒烟（initialize→tools/call 驱动全 9 命令）
```

## 启动 MCP 服务端（--dir 绑定本地目录）

```bash
node packages/server/dist/cli.js --dir <本地文件夹>
# 或构建后：kaiboard-mcp --dir <本地文件夹>
```

- 服务端以 **stdio JSON-RPC 2.0** 暴露 10 个 tool：`kbfs_<cmd>`（9 命令，snake_case）
  + `kbfs_list_capabilities`（一等命令，能力声明）。
- 任意标准 MCP 客户端（WorkBuddy / Cherry Studio / Claude Desktop 等）用 `command` 指向上述
  命令、`args: ["--dir", "<文件夹>"]` 即可连接；画板数据落 `<文件夹>/kaiboard-data/`，
  **永不离开本机**（F1=A 零云红线）。

### 与现有 `kaiboard-bridge` 的关系（重要）

WorkBuddy 里**已有一个** `kaiboard-bridge`（来自 `CKs_KaiBoardDraw_Local` skill）：它把工具命名为
`kaiboard_*`，经 127.0.0.1:8787 中继到**运行中的 KaiBoard app**（截图 / 思维导图都可用，存用户 IndexedDB）。

本服务端是**另一路**——`kbfs_*`（KaiBoard File-System 模式）：不依赖 app、不依赖中继，**零云**、自带
`--dir` 文件夹（架构上的「双存储」第二路）。两路工具前缀刻意错开（`kaiboard_*` vs `kbfs_*`），
**可同时启用、不会撞名**。

| 维度 | `kaiboard-bridge` | `kbfs_*`（本服务端） |
|------|-------------------|----------------------|
| 后端 | 运行中的 KaiBoard app（IndexedDB） | 本地 `--dir` 文件夹（fs） |
| 需要 app 开着？ | 是（且「Agent 共绘」开关 ON） | 否 |
| getScreenshot | ✅ 真实 PNG | ❌ 降级 `ok:false`（无 canvas） |
| fromMermaid | ✅ 原生图元 | ❌ 降级 `ok:false`（无 mermaid 依赖） |
| 数据存储 | 用户 KaiBoard 库 | `<文件夹>/kaiboard-data/` |
| 典型用途 | Agent 直接动用户的真实画板 | Agent 自有的、零云的独立工作区 |

### 接进 WorkBuddy（mcp.json 片段）

将下面这段加进 `~/.workbuddy/mcp.json` 的 `mcpServers`（与 `kaiboard-bridge` 并列，**不冲突**），
然后在连接器管理页面对 `kaiboard-mcp` 点「信任」即可启用：

```json
"kaiboard-mcp": {
  "command": "C:\\Users\\86158\\.workbuddy\\binaries\\node\\versions\\22.22.2\\node.exe",
  "args": [
    "E:/WorkBuddyData/PProjectManagement/KaiBoard-MCP/packages/server/dist/cli.js",
    "--dir",
    "E:/WorkBuddyData/PProjectManagement/kaiboard-agent-workspace"
  ],
  "disabled": false
}
```

> `--dir` 指向的文件夹首次写入时自动创建（`kaiboard-data/` 子树），无需手动建。

## Headless 限制（--dir 模式）

`--dir` 是纯 Node 服务端、**无浏览器 canvas**，以下两条命令会优雅降级为 `ok:false`（不崩）：

| 命令 | 行为 | 原因 | 后续 |
|------|------|------|------|
| `getScreenshot` | 非空板 → `ok:false`，`error.code=EXEC_FAILED`（"screenshot unsupported"） | 无 canvas 渲染 PNG | R1：由含画布的宿主（app / 中继）注入 `renderPng` 钩子 |
| `fromMermaid` | `ok:false`，`error.code=MERMAID_PARSE_FAILED` | `@excalidraw/mermaid-to-excalidraw` 未在独立服务端安装（peer optional，需宿主注入或显式安装） | M2 决策：是否在 CLI 里装 mermaid-to-excalidraw（其依赖 mermaid.js，浏览器向，需 DOM/headless 方案） |

其余 7 条命令在 `--dir` 下完全可用，且落盘即见（与 app `fsStore.ts` 布局一致）。

## 依赖边界

- `@kaiboard/core` **零运行时硬依赖**：所有「存储 / 当前画布 / 截图渲染」都经 `StorageAdapter` 注入。
- `mermaid.ts` 动态 `import("@excalidraw/mermaid-to-excalidraw")` / `import("@excalidraw/excalidraw")`：
  声明为 **peerDependencies（optional）**，由宿主（app / MCP 服务端）在运行时提供；
  core 包内用 `shims.d.ts` 占位仅过类型检查。
- `crypto.randomUUID()` 用运行环境原生全局（浏览器 / Node 22+ 均内置），无需 polyfill。
