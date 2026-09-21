# 变更日志 / Changelog

> 面向用户 / 随开源发布包一起看的版本变更记录。
> User-facing version history, shipped with the open-source release.

格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0] - 2026-09-21

补齐 Agent 在**文件树上的完整管理闭环**：建 / 改 / 移 / 排 / 删 / **还原**。
Complete tree-management loop: create / rename / move / reorder / delete / **restore**.

### Added / 新增

- **`createFolder`** — 新建文件夹（返回 `folderId`；`parentId` 必须是已存在的文件夹）。
- **`renameBoard`** / **`renameFolder`** — 改名（返回 `previousName`）。
- **`moveNode`** — 移动节点到另一父级（画板与文件夹皆可；含两道防环）。
- **`reorderNode`** — 调整同层排序权重。
- **`deleteFolder`** — 软删除文件夹**及其全部子孙**（进回收站，可还原）。
- **`listTrash`** — 回收站顶层条目（子孙不重复列）。
- **`restoreNode`** — 从回收站还原（连整棵子树；原父级若已不在则自动落到根层）。

### Notes / 说明

- 全部为**向后兼容的新增** → 按 SemVer 记为 **MINOR**；`kbProtocol` 保持 `1.0`，老客户端不受影响。
- **类型校验是显式的**：`renameBoard` / `deleteBoard` 遇到文件夹会提示 `use renameFolder` / `use deleteFolder`（反之亦然），避免"改错 / 删错对象"这类静默错误。
- **`deleteFolder` 会拒绝**删除"当前打开的画板所在"的文件夹 → 请先切换画板。
- **回收站语义**：删除只给**顶层**打 `trashRoot` 标记，子孙只打 `deletedAt` → `listTrash` 只列顶层，`restoreNode` 还原顶层即带出整棵子树。
- **`--dir` 不支持** `deleteFolder` / `listTrash` / `restoreNode`（与 `deleteBoard` 一致）；`moveNode` / `reorderNode` 两种模式都可用。
- 🔧 **内部：relay 转发由「逐字段白名单」改为透传**。此前新增 `folderId` 时漏加白名单，导致该字段被静默丢弃（`renameFolder` 在 relay 路径下直接失效）。改为透传后此类缺陷从结构上消除。
- 完整命令清单始终以 `kbfs_list_capabilities` 返回的 `commands` 为准。

---

## [0.2.0] - 2026-09-18 · 首个公开发布版 / First public release

首个公开发布版本。`0.x` 表示 API 在次版本之间仍可能变化；`1.0.0` 才代表稳定性承诺。

First public release. `0.x` means the API may still change between minor versions; `1.0.0` will mark the stability commitment.

### Added / 新增

- **`@kaibuddy/kaiboard-mcp`** — MCP server over stdio JSON-RPC 2.0, exposing 12 `kbfs_*` tools.

  **`@kaibuddy/kaiboard-mcp`** —— 基于 stdio JSON-RPC 2.0 的 MCP 服务端，暴露 12 个 `kbfs_*` 工具。

- Two combinable modes served by the single package: `--relay` (built-in local relay driving a running KaiBoard page) and `--dir` (storage-adapter binding to a local folder).

  单一包提供两种**可叠加**的工作方式：`--relay`（内建本地中继，驱动运行中的 KaiBoard 页面）与 `--dir`（绑定本地文件夹的存储适配器）。

- Request idempotency via `requestId` replay, plus `kbProtocol` version negotiation.

  通过 `requestId` 回放的请求幂等，以及 `kbProtocol` 版本协商。

- Capability discovery (`kbfs_list_capabilities`) reporting storage modes, snapshot limit, and relay / page connection status.

  能力发现（`kbfs_list_capabilities`）：报告存储模式、快照上限、中继与页面连接状态。

- Auto-snapshot (up to 20) on `kbfs_replace_board`, restorable in the app.

  `kbfs_replace_board` 自动快照（上限 20），可在应用内还原。

- Mermaid → native editable elements (`kbfs_from_mermaid`), via an optional dependency.

  Mermaid → 原生可编辑图元（`kbfs_from_mermaid`），通过可选依赖实现。

- **`@kaibuddy/kaiboard-core`** — storage-agnostic command core reused by the server.

  **`@kaibuddy/kaiboard-core`** —— 服务端复用的、与存储无关的指令核心。

- Element shorthand aliases so `fill` / `stroke` work as `backgroundColor` / `strokeColor`.

  元素短名别名：`fill` / `stroke` 等价于 `backgroundColor` / `strokeColor`。

- Explicit degradation instead of failure when a capability is unavailable in the current runtime (`kbfs_get_screenshot`, `kbfs_from_mermaid`, `kbfs_set_metadata` under `--dir`).

  能力在当前运行时不支持时**显式降级而非失败**（`--dir` 下的 `kbfs_get_screenshot`、`kbfs_from_mermaid`、`kbfs_set_metadata`）。

- Bilingual operation: CLI usage, MCP tool descriptions, and notices are rendered in **English + Chinese**, so agents and users on either language see the same guidance.

  双语运行：CLI 用法、MCP 工具描述与提示信息均以**英文 + 中文**呈现，让不同语言的 Agent 与用户看到一致的说明。

### Compatibility / 兼容性

- `kbProtocol` is an **independent protocol axis**, decoupled from the package version. **Same major version = compatible**: a `1.x` client works against any `1.x` server, and minor/patch upgrades never break existing integrations. See [`docs/PROTOCOL.md` §2](./docs/PROTOCOL.md).

  `kbProtocol` 是**独立于包版本的协议轴**。**主版本号一致即兼容**：`1.x` 客户端可对接任意 `1.x` 服务端，次版本 / 修订版本升级不会打断既有接入。见 [`docs/PROTOCOL.zh-CN.md` §2](./docs/PROTOCOL.zh-CN.md)。

[0.2.0]: https://github.com/ChasenKai/kaiboard-mcp/releases/tag/v0.2.0
