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
```

## 依赖边界

- `@kaiboard/core` **零运行时硬依赖**：所有「存储 / 当前画布 / 截图渲染」都经 `StorageAdapter` 注入。
- `mermaid.ts` 动态 `import("@excalidraw/mermaid-to-excalidraw")` / `import("@excalidraw/excalidraw")`：
  声明为 **peerDependencies（optional）**，由宿主（app / MCP 服务端）在运行时提供；
  core 包内用 `shims.d.ts` 占位仅过类型检查。
- `crypto.randomUUID()` 用运行环境原生全局（浏览器 / Node 22+ 均内置），无需 polyfill。
