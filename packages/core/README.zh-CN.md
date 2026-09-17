# @kaibuddy/kaiboard-core

[English](./README.md) | **简体中文**

KaiBoard Agent 共绘的**与存储无关**的指令核心。被 [`@kaibuddy/kaiboard-mcp`](../server) 复用。

提供命令执行器、元素模型、快照/合并逻辑，以及 Mermaid → Excalidraw 转换 —— 不绑定任何存储后端（由 `StorageAdapter` 注入）。

## 安装

```bash
npm install @kaibuddy/kaiboard-core
```

## 第三方组件与许可

第三方组件以**可选** peer 依赖方式引用（许可文本随各自包分发）：

| 组件 | 许可 | 用途 |
|---|---|---|
| `@excalidraw/excalidraw` | MIT | 元素类型 / 画布渲染（由宿主提供） |
| `@excalidraw/mermaid-to-excalidraw` | MIT | Mermaid 转图元（可选） |

仅构建期使用：`typescript`（Apache-2.0）、`@types/node`（MIT）。

本仓**未包含任何上游源码副本**，所有组件均以普通 npm 依赖使用。

## License

[MIT](./LICENSE)
