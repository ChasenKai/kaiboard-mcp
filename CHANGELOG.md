# 变更日志 / Changelog

> 面向用户 / 随开源发布包一起看的版本变更记录。
> User-facing version history, shipped with the open-source release.

格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
