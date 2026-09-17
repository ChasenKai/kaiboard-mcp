# @kaibuddy/kaiboard-core

**English** | [简体中文](./README.zh-CN.md)

Storage-agnostic command core for KaiBoard Agent co-drawing. Reused by [`@kaibuddy/kaiboard-mcp`](../server).

Provides the command executor, element model, snapshot/merge logic, and Mermaid → Excalidraw conversion — independent of any storage backend (driven by a `StorageAdapter`).

## Install

```bash
npm install @kaibuddy/kaiboard-core
```

## Third-party notices

Third-party components are referenced as **optional** peer dependencies; the license text ships inside each package:

| Component | License | Role |
|---|---|---|
| `@excalidraw/excalidraw` | MIT | element types / canvas rendering (provided by the host) |
| `@excalidraw/mermaid-to-excalidraw` | MIT | Mermaid → element conversion (optional) |

Build-time only: `typescript` (Apache-2.0), `@types/node` (MIT).

No upstream source code is vendored — every component is used as an ordinary npm dependency.

## License

MIT — see [LICENSE](./LICENSE).
