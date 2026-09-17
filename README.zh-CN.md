# KaiBoard MCP Server

[English](./README.md) | **简体中文** · [协议文档](./docs/PROTOCOL.md) · [变更日志](./CHANGELOG.md)

> 让支持 MCP 的 AI Agent 在你自己的 KaiBoard 白板上作画。

KaiBoard 是一个免费、开源、**本地优先**的白板：画板数据存在你自己的设备上，不上云。
本仓是让 Agent 读写这些画板的桥梁 —— Agent 跑在你运行 MCP 客户端的地方，**画布始终在你机器上**。

本仓包含两个可独立使用的包：

| 包 | 作用 |
|---|---|
| [`@kaibuddy/kaiboard-mcp`](https://www.npmjs.com/package/@kaibuddy/kaiboard-mcp) | MCP 服务端（stdio JSON-RPC 2.0），暴露 `kbfs_*` 工具 |
| [`@kaibuddy/kaiboard-core`](https://www.npmjs.com/package/@kaibuddy/kaiboard-core) | 与存储无关的指令核心（命令执行、元素处理、快照、Mermaid 转换） |

---

## 它能做什么

`@kaibuddy/kaiboard-mcp` 是**单一包**，通过同一组 `kbfs_*` 工具提供两种**可叠加**的工作方式：

| | `--relay` 模式（主推） | `--dir` 模式 |
|---|---|---|
| 后端 | 正在运行中的 KaiBoard 页面 | 你指定的本地文件夹 |
| 需要应用开着？ | 需要（且在应用内启用「Agent 共绘」） | 不需要 |
| 典型用途 | Agent 直接操作用户当前画板，改动即时可见 | Agent 自有的本地工作区 |
| 数据落点 | 用户自己的 KaiBoard 库 | `<文件夹>/kaiboard-data/` |

两者可同时启用：

```bash
kaiboard-mcp --relay --dir /path/to/workspace
```

## 安装

```bash
npm install -g @kaibuddy/kaiboard-mcp
# 或免安装直接运行
npx -y @kaibuddy/kaiboard-mcp
```

需要 Node.js **>= 18**。

## 接进你的 MCP 客户端

**推荐：`--relay` 模式**（驱动你正在看的画板，改动即时可见）。
需要带上中继令牌 —— 在 KaiBoard 的「Agent 共绘」面板里取得：

```json
{
  "kaiboard": {
    "command": "npx",
    "args": ["-y", "@kaibuddy/kaiboard-mcp", "--relay"],
    "env": { "KAIBOARD_TOKEN": "<你的令牌>" }
  }
}
```

> `--relay` 会在本机 `127.0.0.1:8787` 起一个**内建的中继**，与 KaiBoard 页面通信。
> 因此**中继与页面必须在同一台机器上**，且操作期间**页面保持打开**。

也可以只用 `--dir` 模式（不依赖应用，Agent 在本地文件夹里独立工作）：

```json
{
  "kaiboard-mcp": {
    "command": "npx",
    "args": ["-y", "@kaibuddy/kaiboard-mcp", "--dir", "/path/to/your/workspace"]
  }
}
```

两者可叠加：`"args": ["-y", "@kaibuddy/kaiboard-mcp", "--relay", "--dir", "/path/to/your/workspace"]`

改完配置后需要**重启你的 MCP 客户端**，让它重新加载。

## 工具清单

`tools/list` 返回 **12 个工具**（11 个命令 + 1 个能力声明）：

| 工具 | 用途 |
|---|---|
| `kbfs_list_capabilities` | 查询当前运行时的能力（可用命令、存储模式、页面是否已连接） |
| `kbfs_list_boards` | 列出画板与文件夹 |
| `kbfs_get_board` | 读取画板元素 |
| `kbfs_get_screenshot` | 把画板渲染成 PNG 交回 Agent 自查（`--relay` 可用；`--dir` 优雅降级） |
| `kbfs_add_element` | 追加图元 |
| `kbfs_patch_element` | 按 id 局部修改属性 |
| `kbfs_delete_element` | 按 id 删除图元 |
| `kbfs_replace_board` | 整板替换（自动快照） |
| `kbfs_create_board` | 新建画板 |
| `kbfs_delete_board` | 删除画板（软删除，可在应用内还原） |
| `kbfs_from_mermaid` | Mermaid 源码转成原生可编辑图元 |
| `kbfs_set_metadata` | 写画板级元数据（状态 / 版本 / 历史 / 批注） |

命令行细节、信封格式、错误码见 **[`docs/PROTOCOL.md`](./docs/PROTOCOL.md)**。

## 元素与填充色

图元使用 Excalidraw 元素格式。填充色可写短名 `fill`（等价于 `backgroundColor`），描边可写 `stroke`（等价于 `strokeColor`）：

```json
{
  "type": "rectangle",
  "id": "r1",
  "x": 40, "y": 40, "width": 160, "height": 90,
  "fill": "#ffec99",
  "stroke": "#e8590c"
}
```

## 数据与隐私

- **画板数据不会上传到任何服务器。** `--relay` 模式的中继只监听 `127.0.0.1`，仅用于同机通信；`--dir` 模式直接读写你指定的本地文件夹。
- 无需账号，无需登录。
- 落盘布局（`--dir` 模式）：`kaiboard-data/boards/<id>.json` + `kaiboard-data/tree.json`，该格式可直接被 KaiBoard 打开。

## 开发

```bash
npm install
npm run typecheck   # 类型检查
npm run build       # 构建两个包到各自 dist/
npm run e2e         # 端到端（核心 + 文件后端 / 真实 stdio server）
npm run smoke       # 真实 MCP 客户端冒烟（initialize → tools/call）
```

## 第三方组件与许可

第三方组件以**可选** peer 依赖方式引用（许可文本随各自包分发）：

| 组件 | 许可 | 用途 |
|---|---|---|
| `@excalidraw/excalidraw` | MIT | 元素类型 / 画布渲染（由宿主提供） |
| `@excalidraw/mermaid-to-excalidraw` | MIT | Mermaid 转图元（可选） |

仅构建期使用：`typescript`（Apache-2.0）、`@types/node`（MIT）。

本仓**未包含任何上游源码副本**，所有组件均以普通 npm 依赖使用。

## 版本

当前为 `0.1.x` —— API 在次版本之间仍可能变化；`1.0.0` 才代表稳定性承诺。

## License

[MIT](./LICENSE)
