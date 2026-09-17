# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-09-17

### Changed

- **Bilingual user-facing strings.** CLI usage, MCP tool descriptions, and the `--dir` / relay notices now render in **English + Chinese** (previously Chinese only), matching the English README and protocol document. Tool descriptions are read by agents through `tools/list`.

## [0.1.0] - 2026-09-17

First public release. `0.x` means the API may still change between minor versions;
`1.0.0` will mark the stability commitment.

### Added

- **`@kaibuddy/kaiboard-mcp`** — MCP server over stdio JSON-RPC 2.0, exposing 12 `kbfs_*` tools.
- Two combinable modes served by the single package: `--relay` (built-in local relay driving a running KaiBoard page) and `--dir` (storage-adapter binding to a local folder).
- Request idempotency via `requestId` replay, plus `kbProtocol` version negotiation.
- Capability discovery (`kbfs_list_capabilities`) reporting storage modes, snapshot limit, and relay / page connection status.
- Auto-snapshot (up to 20) on `kbfs_replace_board`, restorable in the app.
- Mermaid → native editable elements (`kbfs_from_mermaid`), via an optional dependency.
- **`@kaibuddy/kaiboard-core`** — storage-agnostic command core reused by the server.
- Element shorthand aliases so `fill` / `stroke` work as `backgroundColor` / `strokeColor`.
- Explicit degradation instead of failure when a capability is unavailable in the current runtime (`kbfs_get_screenshot`, `kbfs_from_mermaid`, `kbfs_set_metadata` under `--dir`).

[Unreleased]: https://github.com/ChasenKai/kaiboard-mcp/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/ChasenKai/kaiboard-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ChasenKai/kaiboard-mcp/releases/tag/v0.1.0
