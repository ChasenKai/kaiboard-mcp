# @kaibuddy/kaiboard-mcp

**English** | [简体中文](./README.zh-CN.md)

KaiBoard MCP server — lets AI agents draw **on your local KaiBoard whiteboards** over the Model Context Protocol (stdio JSON-RPC).

KaiBoard is a free, open-source, **local-first** whiteboard: your boards live on your device, never in the cloud. This server is the bridge that lets an Agent read and edit those boards — the agent runs wherever your MCP client runs; **the canvas stays on your machine**.

## Install

```bash
npm install -g @kaibuddy/kaiboard-mcp
# or run without installing
npx -y @kaibuddy/kaiboard-mcp
```

Requires Node.js >= 18.

## Two modes

Both modes are served by this **single package** and can be combined.

### 1. `--relay` (recommended — drives the board you're looking at)

Starts a **built-in local relay** on `127.0.0.1:8787` that talks to a running KaiBoard page. Commands flow into the live page, so changes appear as you watch, and the page persists them to whichever storage you chose in KaiBoard.

```jsonc
// MCP client config
{
  "mcpServers": {
    "kaiboard": {
      "command": "npx",
      "args": ["-y", "@kaibuddy/kaiboard-mcp", "--relay"],
      "env": { "KAIBOARD_TOKEN": "<your-token>" }
    }
  }
}
```

- `KAIBOARD_TOKEN` — required for relay mode. Get it from KaiBoard's **"Agent co-draw"** panel.
- The relay listens on **loopback only** and only talks to a page on the **same machine**. That page has to stay open while the agent works.

### 2. `--dir <path>` (works without the app)

Binds directly to a local folder through the `fsStorageAdapter`. No relay, no network — the agent reads and writes a folder of its own.

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

On disk: `kaiboard-data/boards/<id>.json` plus `kaiboard-data/tree.json`. KaiBoard can open that folder directly.

> Tip: add `--relay-url <url>` alongside `--dir` to have the server check whether your working folder matches the folder KaiBoard currently has open, and warn you when it doesn't.

## Tools (prefix `kbfs_`)

`tools/list` returns 12 tools.

| Tool | Purpose |
|---|---|
| `kbfs_list_capabilities` | Discover server capabilities |
| `kbfs_list_boards` | List available boards |
| `kbfs_get_board` | Read a board's elements |
| `kbfs_create_board` | Create a board |
| `kbfs_delete_board` | Delete a board (soft-delete, recoverable) |
| `kbfs_add_element` | Add elements (supports `opts.noOffset` for exact placement) |
| `kbfs_patch_element` | Patch elements by id |
| `kbfs_delete_element` | Delete elements by id |
| `kbfs_replace_board` | Replace a board's contents (auto-snapshot) |
| `kbfs_from_mermaid` | Build a board from a Mermaid diagram |
| `kbfs_get_screenshot` | Render a board to PNG so the agent can look at it |
| `kbfs_set_metadata` | Set board metadata (status / version / history / comments) |

Protocol details, envelopes, error codes and capability negotiation: see [`docs/PROTOCOL.md`](https://github.com/ChasenKai/kaiboard-mcp/blob/main/docs/PROTOCOL.md).

## Notes

- Built on [`@kaibuddy/kaiboard-core`](https://www.npmjs.com/package/@kaibuddy/kaiboard-core) (storage-agnostic command core).
- **Versioning**: this is a `0.x` release — the API may still change between minor versions. `1.0.0` will mark the stability commitment.
- Local-first, privacy-first: these commands never upload your board data to a server.

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
