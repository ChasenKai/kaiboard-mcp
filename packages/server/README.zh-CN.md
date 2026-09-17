# @kaibuddy/kaiboard-mcp

[English](./README.md) | **简体中文**

KaiBoard 的 MCP 服务端 —— 让 AI Agent 通过 Model Context Protocol（stdio JSON-RPC）**在你本地的 KaiBoard 白板上作画**。

KaiBoard 是一个免费、开源、**本地优先**的白板：画板数据存在你自己的设备上，不上云。本服务端就是让 Agent 读写这些画板的桥梁 —— Agent 跑在你运行 MCP 客户端的地方，**画布始终在你机器上**。

## 安装

```bash
npm install -g @kaibuddy/kaiboard-mcp
# 或免安装直接运行
npx -y @kaibuddy/kaiboard-mcp
```

需要 Node.js **>= 18**。

## 两种模式

两种模式由**同一个包**提供，可叠加使用。

### 1. `--relay`（推荐 —— 驱动你正在看的画板）

在本机 `127.0.0.1:8787` 起一个**内建的中继**，与运行中的 KaiBoard 页面通信。命令直接进入实时页面，改动你**当场就能看到**，并由页面按其存储设置落盘。

```jsonc
// MCP 客户端配置
{
  "mcpServers": {
    "kaiboard": {
      "command": "npx",
      "args": ["-y", "@kaibuddy/kaiboard-mcp", "--relay"],
      "env": { "KAIBOARD_TOKEN": "<你的令牌>" }
    }
  }
}
```

- `KAIBOARD_TOKEN` —— relay 模式必需。在 KaiBoard 的 **「Agent 共绘」** 面板里取得。
- 中继**只监听环回地址**，且只与**同一台机器**上的页面通信。Agent 工作期间，**该页面需要保持打开**。

### 2. `--dir <path>`（不需要应用）

通过 `fsStorageAdapter` 直接绑定一个本地文件夹。无中继、无网络 —— Agent 拥有自己的离线工作区。

```jsonc
{
  "mcpServers": {
    "kaiboard": {
      "command": "npx",
      "args": ["-y", "@kaibuddy/kaiboard-mcp", "--dir", "/abs/path/to/your/workspace"]
    }
  }
}
```

落盘布局：`kaiboard-data/boards/<id>.json` 与 `kaiboard-data/tree.json`。KaiBoard 可以直接打开该文件夹。

> 小技巧：在 `--dir` 之外再加 `--relay-url <url>`，服务端会检查你的工作目录与 KaiBoard 当前打开的文件夹是否一致，不一致时给出提示。

## 工具清单（前缀 `kbfs_`）

`tools/list` 返回 12 个工具。

| 工具 | 用途 |
|---|---|
| `kbfs_list_capabilities` | 查询运行时能力 |
| `kbfs_list_boards` | 列出画板与文件夹 |
| `kbfs_get_board` | 读取画板元素 |
| `kbfs_create_board` | 新建画板 |
| `kbfs_delete_board` | 删除画板（软删除，可还原） |
| `kbfs_add_element` | 追加图元（支持 `opts.noOffset` 精确落位） |
| `kbfs_patch_element` | 按 id 局部修改属性 |
| `kbfs_delete_element` | 按 id 删除图元 |
| `kbfs_replace_board` | 整板替换（自动快照） |
| `kbfs_from_mermaid` | 由 Mermaid 图生成画板 |
| `kbfs_get_screenshot` | 把画板渲染成 PNG 交回 Agent 自查 |
| `kbfs_set_metadata` | 写画板级元数据（状态 / 版本 / 历史 / 批注） |

协议细节、信封格式、错误码与能力协商：见 [`docs/PROTOCOL.zh-CN.md`](https://github.com/ChasenKai/kaiboard-mcp/blob/main/docs/PROTOCOL.zh-CN.md)。

## 说明

- 基于 [`@kaibuddy/kaiboard-core`](https://www.npmjs.com/package/@kaibuddy/kaiboard-core)（与存储无关的指令核心）。
- **版本**：当前为 `0.x` —— API 在次版本之间仍可能变化；`1.0.0` 才代表稳定性承诺。
- 本地优先、隐私优先：这些命令**不会**把画板数据上传到任何服务器。

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
