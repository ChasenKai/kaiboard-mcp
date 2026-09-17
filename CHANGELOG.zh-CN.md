# 变更日志

[English](./CHANGELOG.md) | **简体中文**

本项目的所有重要变更都记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.1.1] - 2026-09-17

### 变更

- **对外文案改为英文 + 中文双语。** CLI 用法、MCP 工具描述以及 `--dir` / 中继的提示信息现在同时提供英文与中文（此前仅中文），与英文的 README 和协议文档保持一致。工具描述会经 `tools/list` 交给 Agent 读取。

## [0.1.0] - 2026-09-17

首次公开发布。`0.x` 表示 API 在次版本之间仍可能变化；`1.0.0` 才代表稳定性承诺。

### 新增

- **`@kaibuddy/kaiboard-mcp`** —— 基于 stdio JSON-RPC 2.0 的 MCP 服务端，暴露 12 个 `kbfs_*` 工具。
- 单一包提供两种**可叠加**的工作方式：`--relay`（内建本地中继，驱动运行中的 KaiBoard 页面）与 `--dir`（绑定本地文件夹的存储适配器）。
- 通过 `requestId` 回放的请求幂等，以及 `kbProtocol` 版本协商。
- 能力发现（`kbfs_list_capabilities`）：报告存储模式、快照上限、中继与页面连接状态。
- `kbfs_replace_board` 自动快照（上限 20），可在应用内还原。
- Mermaid → 原生可编辑图元（`kbfs_from_mermaid`），通过可选依赖实现。
- **`@kaibuddy/kaiboard-core`** —— 服务端复用的、与存储无关的指令核心。
- 元素短名别名：`fill` / `stroke` 等价于 `backgroundColor` / `strokeColor`。
- 能力在当前运行时不支持时**显式降级而非失败**（`--dir` 下的 `kbfs_get_screenshot`、`kbfs_from_mermaid`、`kbfs_set_metadata`）。

[未发布]: https://github.com/ChasenKai/kaiboard-mcp/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/ChasenKai/kaiboard-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ChasenKai/kaiboard-mcp/releases/tag/v0.1.0
