# kaiboard-mcp

**KaiBoard 的 MCP 服务端** —— 让支持 MCP 的 AI Agent 在你自己的白板上作画。

本仓包含两个可独立使用的包：

| 包 | 作用 |
|---|---|
| [`@kaiboard/mcp-server`](packages/server) | MCP 服务端（stdio JSON-RPC 2.0），暴露 `kbfs_*` 工具 |
| [`@kaiboard/core`](packages/core) | 与存储无关的指令核心（命令执行、元素处理、快照、Mermaid 转换） |

> 配套客户端是开源白板应用 **KaiBoard**（本地优先、无账号、无后端）。

---

## 它能做什么

`@kaiboard/mcp-server` 是**单一包**，通过同一组 `kbfs_*` 工具提供两种**可叠加**（非互斥）的工作方式：

| | `--dir` 模式 | `--relay` 模式 |
|---|---|---|
| 后端 | 你指定的本地文件夹 | 正在运行中的 KaiBoard 页面 |
| 需要应用开着？ | 不需要 | 需要（且在应用内启用「Agent 共绘」） |
| 典型用途 | Agent 自有的本地工作区 | Agent 直接操作用户当前画板，改动即时可见 |
| 数据落点 | `<文件夹>/kaiboard-data/` | 用户自己的 KaiBoard 库 |

两者可同时启用：

```bash
kaiboard-mcp --relay --dir /path/to/workspace
```

## 安装

```bash
npm install -g @kaiboard/mcp-server
# 或免安装直接运行
npx -y @kaiboard/mcp-server --help
```

## 接进你的 MCP 客户端

在客户端的 MCP 配置里加一条（`command` / `args` 按你的实际安装方式填写）：

```json
{
  "kaiboard-mcp": {
    "command": "npx",
    "args": ["-y", "@kaiboard/mcp-server", "--dir", "/path/to/your/workspace"]
  }
}
```

`--relay` 模式需要额外带上中继令牌（在 KaiBoard 的「Agent 共绘」面板里取得）：

```json
{
  "kaiboard": {
    "command": "npx",
    "args": ["-y", "@kaiboard/mcp-server", "--relay"],
    "env": { "KAIBOARD_TOKEN": "<your-relay-token>" }
  }
}
```

> `--relay` 会在本机 `127.0.0.1:8787` 起一个中继，与 KaiBoard 页面通信。
> 因此中继与页面必须在**同一台机器**上，且操作期间页面保持打开。

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

命令行细节、信封格式、错误码见 **[`docs/PROTOCOL-v2.md`](docs/PROTOCOL-v2.md)**。

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

- **画板数据不会上传到任何服务器。** `--dir` 模式直接读写你指定的本地文件夹；`--relay` 模式的中继只监听 `127.0.0.1`，用于同机通信。
- 无需账号，无需登录。
- `--dir` 的落盘布局：`kaiboard-data/boards/<id>.json` + `kaiboard-data/tree.json`；该格式可直接被 KaiBoard 打开。

## 开发

```bash
npm install
npm run typecheck   # 类型检查
npm run build       # 构建两个包到各自 dist/
npm run e2e         # 端到端（核心 + 文件后端 / 真实 stdio server）
npm run smoke       # 真实 MCP 客户端冒烟（initialize → tools/call）
```

## 依赖说明

- `@kaiboard/core` **无运行时硬依赖**：存储、画布、截图渲染都通过 `StorageAdapter` 注入，core 本身不绑定任何后端。
- `@excalidraw/excalidraw`、`@excalidraw/mermaid-to-excalidraw` 为 **可选 peerDependencies**，由宿主（应用或服务端）在运行时提供；`fromMermaid` 与 `getScreenshot` 在缺少它们的运行时会明确返回不支持，而非静默失败。
- 第三方组件与许可见 [`NOTICE`](NOTICE) / [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md)。

## License

[MIT](LICENSE)
