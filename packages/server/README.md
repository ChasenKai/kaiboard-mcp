# @kaiboard/mcp-server

KaiBoard MCP server — lets AI agents draw **on your local KaiBoard whiteboards** over the Model Context Protocol (stdio JSON-RPC).

KaiBoard is a free, open-source, **local-first** whiteboard: your boards live on your device, never in the cloud. This server is the bridge that lets an Agent read and edit those boards — the "brain" runs wherever your Agent runs; the **canvas stays on your machine** (zero-cloud, F1).

## Install

```bash
npm install -g @kaiboard/mcp-server
```

Requires Node.js >= 18.

## Two modes

### 1. `--relay` (recommended, real-time co-draw)

Connects to a running KaiBoard (AI build) page through a relay. This is the main real-time path: Agent commands flow into the live page, and the page persists to your chosen storage.

```jsonc
// MCP client config (e.g. Claude Desktop / Cursor / your Agent host)
{
  "mcpServers": {
    "kaiboard": {
      "command": "kaiboard-mcp",
      "args": ["--relay"],
      "env": { "KAIBOARD_TOKEN": "<your-token>" }
    }
  }
}
```

- `KAIBOARD_TOKEN` — required for relay mode (set in KaiBoard's settings).
- The relay is optional infrastructure; if you self-host, point it at your own relay.

### 2. `--dir <path>` (offline, zero-cloud)

Binds directly to a local folder of `.excalidraw` / KaiBoard board files via the `fsStorageAdapter`. No relay, no network — purely local F1 path.

```jsonc
{
  "mcpServers": {
    "kaiboard": {
      "command": "kaiboard-mcp",
      "args": ["--dir", "/abs/path/to/your/boards"]
    }
  }
}
```

> `--dir` is an optional Agent capability, not the primary user-facing path. It duplicates nothing KaiBoard already does locally.

## Tools (prefix `kbfs_`)

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
| `kbfs_replace_board` | Replace a board's contents |
| `kbfs_from_mermaid` | Build a board from a Mermaid diagram |
| `kbfs_get_screenshot` | Headless PNG snapshot (Agent capability) |
| `kbfs_set_metadata` | Set board metadata |

## Notes

- Built on `@kaiboard/core` (storage-agnostic command core).
- This server is the **Beta** Agent surface of KaiBoard v1.1.0. AI / Agent features are experimental.
- Local-first, privacy-first: your board data never leaves your device.

## License

MIT — see [LICENSE](./LICENSE).
