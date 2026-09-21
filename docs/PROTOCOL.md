# KaiBoard Agent Protocol

**English** | [简体中文](./PROTOCOL.zh-CN.md) · [README](../README.md) · [Changelog](../CHANGELOG.md)

> **STATUS**: This is the authoritative protocol document for `@kaibuddy/kaiboard-mcp`.
> Package version source of truth: the `version` field in `packages/server/package.json`. The protocol identifier `kbProtocol` is **an independent axis** — see §2.
> Also **independent of the KaiBoard app version**.
>
> Anchored to real code (read from source and exercised by tests, not inferred):
> - Commands: `packages/core/src/executor.ts`
> - Transport: `packages/server/src/server.ts` (stdio JSON-RPC 2.0, tool prefix `kbfs_*`)
> - Envelope / error codes: `packages/server/src/protocol.ts`

---

## 0. Scope and positioning

This protocol defines the **Agent ↔ KaiBoard** logical command contract (command set + envelope + version and capability negotiation + error codes + data boundary).

It is **transport-agnostic**: the same logical commands can be bound to different transports.

| Binding | How to start | Transport | Notes |
|---|---|---|---|
| **relay (`--relay`) · recommended** | `kaiboard-mcp --relay` | Local HTTP relay (`127.0.0.1`) | Drives a **running** KaiBoard page; the user must have "Agent co-draw" enabled |
| **local (`--dir`)** | `kaiboard-mcp --dir <folder>` | Direct read/write of a local directory | The server embeds a storage adapter (`fsStorageAdapter`); no app, no relay required |

> **Single package, two combinable modes**: both belong to `@kaiboard/mcp-server` and can be enabled together (`--relay --dir <path>`); the tool prefix is always `kbfs_*`.
> The protocol specifies *what a command says and returns*, not *which transport carries it*; both bindings must satisfy this envelope and semantics.

---

## 1. Envelope

### 1.1 Request

```jsonc
{
  "kbProtocol": "1.0",     // optional: omit to let the server assume its default; supply it to negotiate (see §2)
  "requestId": "uuid-v4",  // optional: the server generates one if omitted (losing idempotent replay, see §3)
  "cmd": "getBoard",       // one of the commands (see §6); MCP tool names in §1.4
  "token": "24-hex",       // omittable in --dir mode (purely local); required for relay mode
  // ...command-specific parameters (see each command's section)
}
```

### 1.2 Response

```jsonc
{
  "kbProtocol": "1.0",
  "requestId": "uuid-v4",  // echoed back so the client can pair it
  "ok": true,
  "result": { /* command-specific */ }
}
// or on failure:
{
  "kbProtocol": "1.0",
  "requestId": "uuid-v4",
  "ok": false,
  "error": { "code": "BOARD_NOT_FOUND", "message": "..." }
}
```

### 1.3 Transport wrapping (MCP binding)

- Requests are wrapped in JSON-RPC 2.0 `tools/call`: `params.arguments` carries the §1.1 request fields directly.
- Responses arrive in `result.content[0].text` (a JSON string); the client `JSON.parse`s it into the §1.2 response object.
- `initialize` follows the standard MCP handshake (`protocolVersion: "2024-11-05"`); `params.arguments.kbProtocol` can carry this protocol's version for a second negotiation round.
- Under the `--dir` binding the server calls the core executor in-process and returns this protocol's response object directly.

### 1.4 MCP tool naming

- Command → tool name: **`kbfs_` + camelCase converted to snake_case**.
  e.g. `getBoard` → `kbfs_get_board`; `addElement` → `kbfs_add_element`; `replaceBoard` → `kbfs_replace_board`.
- Capability tool: `kbfs_list_capabilities`.
- `tools/list` returns **12 tools** (11 commands + `kbfs_list_capabilities`).
- Each tool's `inputSchema.properties` contains
  `kbProtocol / requestId / token / boardId / elements / patches / ids / name / parentId / mermaid / source / opts / metadata`, with `required: []` (fill in as needed; defaults apply otherwise).

---

## 2. Version negotiation

`kbProtocol` is **an independent protocol axis, decoupled from the package version**. It is also distinct from the MCP protocol version (`2024-11-05`), which follows the official MCP SDK.

- **Compatibility rule: same major version = compatible.** Any `1.x` client is accepted by a `1.x` server.
- Clients **may omit** `kbProtocol` (the server assumes its current default, for lenient onboarding).
- If supplied:
  - same major version as the server (e.g. client `1.0` or `1.3` against server `1.0`) → execute normally;
  - a different major version (e.g. `2.0`, or the pre-1.0 value `0.1.1`) → `error.code = "PROTOCOL_UNSUPPORTED"`.
- **Minor and patch releases never break clients.** Adding a command or an optional field does *not* bump the `kbProtocol` major version, so package upgrades within `0.x`/`1.x` are safe for existing integrations.
- A **major** bump (e.g. `1.x` → `2.0`) is reserved for genuine breaking changes — removing or renaming a command, changing a parameter's meaning, or making an optional field required.

> **Do not hard-code `kbProtocol` from examples.** The version shown in snippets is illustrative. Either omit it, or pass the version your client was built against — the server only checks the major component.

**What counts as a breaking change** (the only reason the major version moves):

- removing or renaming a command / tool, or a required parameter
- changing what an existing parameter *means* (same name, different semantics)
- removing a response field, or changing a field's type
- making a previously optional field required
- changing default behaviour (a call that omits a parameter now behaves differently)

**Not breaking** (ships in a minor/patch release, no `kbProtocol` change): adding a command, adding an optional parameter, adding a response field, bug fixes, wording, performance work.


---

## 3. Idempotency (requestId de-duplication)

- `requestId` is client-generated; a stable UUID is recommended (`crypto.randomUUID()`). **If omitted, the server generates one and that call does not participate in de-duplication.**
- The server keeps a recent `requestId` cache; on a **previously seen** `requestId` it **replays the original response** instead of re-executing the write.
- Purpose: when a write command is retried after a network timeout, reusing the **same `requestId`** prevents double-writes.
- Client discipline: retries must reuse the same `requestId`; to force a redo, use a new one.

---

## 4. Capability negotiation (listCapabilities)

`kbfs_list_capabilities` returns:

```jsonc
{
  "kbProtocol": "1.0",
  "commands": [                      // command allow-list (11 entries)
    "getBoard", "getScreenshot", "listBoards", "addElement",
    "patchElement", "deleteElement", "replaceBoard", "createBoard",
    "createFolder", "renameBoard", "renameFolder",
    "deleteBoard", "fromMermaid", "setMetadata"
  ],
  "storageModes": ["idb", "fs", "dir", "relay"],
  "activeStorageMode": "relay",       // the binding actually in effect
  "snapshot": { "max": 20 },          // replaceBoard auto-snapshot limit
  "serverInfo": { "name": "kaiboard-mcp", "version": "<package version>" },
  "relayAvailable": true,             // whether the relay process is up
  "dirAvailable": false,              // whether the offline folder backend is available
  "pageConnected": true,              // whether a KaiBoard page is actually connected
  "relayFolder": "KaiBoardFolder",    // the folder the page currently has open; null if unreachable
  "dirWarnings": []                   // non-empty = configuration mismatch; the agent should tell the user first
}
```

**Fields you must not confuse when integrating:**

- `relayAvailable` only means **the relay process is up** — it does **not** mean a page is connected; check `pageConnected` to know whether writes can actually land.
- `pageConnected` has a time window (it covers one long-poll plus a reconnect interval), so it may still read `true` briefly after the page closes.
- A non-empty `dirWarnings` means the `--dir` working folder is **not the same** as the folder KaiBoard currently has open; content written by the agent then only becomes visible after the user imports it in the app — surface this to the user before continuing.

---

## 5. Storage modes (storageModes)

| mode | Meaning | On-disk / visibility |
|---|---|---|
| `dir` | `--dir` mode, the agent's working folder | `boards/<id>.json` + `tree.json`; human-readable names are mapped through `tree.json` |
| `fs` | The app's "local folder" storage (File System Access API) | `kaiboard-data/boards/<id>.json` + `tree.json`, visible as soon as written |
| `idb` | Browser IndexedDB (the app's default storage) | Visible only to the current page |
| `relay` | Driving a running page through the local relay | The page persists to whichever storage the user selected |

**On-disk format for `--dir`**: the primary storage is `boards/<id>.json` (BoardData) plus `tree.json` (the file tree) —
**not** "one `.excalidraw` file per board". `.excalidraw` is used only for import/export interoperability.
`tree.json` is the manifest; board-level metadata (status / version / history / comments) extends its `FileNode`.

---

## 6. Command set

> **Addressing**: every board-level command accepts an optional `boardId`.
> - Omitted, or equal to the currently open board → uses the live API (undoable, redraws immediately).
> - An explicit different `boardId` → writes straight to storage (without switching the canvas) and notifies the UI to refresh the tree.
>
> **Provenance**: write commands may carry `source: { kind, text }`, which lands in the new element's `customData.__kbSource` and can be read back verbatim by `getBoard`.

### 6.1 getBoard (read)
- Parameters: `{ boardId? }`
- Response: `{ boardId: string|null, elements: Element[] }`
- Notes: a missing target returns an **empty array** (not an error). `BOARD_NOT_FOUND` is reserved under this binding (see §7).

### 6.2 getScreenshot (read)
- Parameters: `{ boardId?, opts?: { maxWidthOrHeight?, background?, darkMode? } }`
- Behaviour:
  - **Empty board** → `{ ok: true, empty: true, dataUrl: null, boardId }` (success, not an error)
  - **Non-empty + rendering available** (`--relay`, the page supplies rendering) → `{ ok: true, mimeType: "image/png", bytes, dataUrl }`
  - **Non-empty + no renderer** (`--dir`, pure Node with no canvas) → `{ ok: false, error: "screenshot unsupported in this runtime" }` → error code `EXEC_FAILED`
- Errors (reserved): `BOARD_NOT_FOUND`

### 6.3 listBoards (read)
- Parameters: `{}`
- Response: `{ activeBoardId: string|null, nodes: [{ id, type: "board"|"folder", name, parentId, updatedAt }] }`

### 6.4 addElement (write)
- Parameters: `{ elements: Element | Element[], boardId?, source? }`
- Response: `{ ok: true, added: number, ids: string[] }` (`ids` are stable element ids for later patch / delete)
- Notes: on a non-empty board, new elements are moved below existing content by default (to avoid overlap). An empty `elements` returns `added: 0` (not an error).
- Element properties: `fill` is accepted as a shorthand for `backgroundColor`, and `stroke` for `strokeColor`.

### 6.5 patchElement (write)
- Parameters: `{ patches: { id, ...props } | { id, ...props }[], boardId? }`
- Response: `{ ok: true, patched: number, missing: string[] }` (`missing` = ids that do not exist)
- Notes: merges properties by id, keeping the original `id`; an empty `patches` returns `patched: 0`.

### 6.6 deleteElement (write)
- Parameters: `{ ids: string | string[], boardId? }`
- Response: `{ ok: true, deleted: number, missing: string[] }`

### 6.7 replaceBoard (write)
- Parameters: `{ elements: Element[], boardId?, source? }`
- Response: `{ ok: true, replaced: number }`
- Notes: **auto-snapshot** (limit 20, restorable).

### 6.8 createBoard (write)
- Parameters: `{ name?, parentId?, elements?, source? }`
- Response: `{ ok: true, boardId, name, added: number }`
- Notes: writes straight to storage (without switching the canvas); `parentId` must be a folder, otherwise `PARENT_NOT_FOLDER`.

### 6.9 deleteBoard (write)
- Parameters: `{ boardId }` (**required**)
- Response: `{ ok: true, deleted: 1, boardId, name, trashed: true }`
- Notes: **soft delete** (moves to trash, restorable in the app). Constraints: boards only (folders are handled in the app); **refuses to delete the currently open board** (switch first). Not supported under `--dir` → returns `unsupported`.

### 6.10 fromMermaid (write)
- Parameters: `{ mermaid: string, boardId?, opts?: { replace?, fontSize? }, source? }`
- Response: `{ ok: true, replaced|added, fromMermaid: true, files?: number }`
- Notes: Mermaid source → native editable elements; `opts.replace` replaces the whole board (auto-snapshot), otherwise it appends. `source.kind` is set to `"mermaid"` automatically.
- **Dependency note**: requires the optional `@excalidraw/mermaid-to-excalidraw`. When missing (e.g. under `--dir`) it returns an **actionable hint** suggesting `--relay` instead.
- Errors: `MERMAID_PARSE_FAILED`

### 6.11 setMetadata (write)
- Parameters: `{ boardId?, metadata: { status?, version?, history?, comments? } }`
  - `status?`: a status string (e.g. `draft` / `review` / `done`)
  - `version?`: an incrementing version number
  - `history?`: an array of `{ ts, version, note? }` — **replaced wholesale**
  - `comments?`: a comments array — **replaced wholesale**
- Response: `{ ok: true, boardId }`
- Notes: metadata is merged back into the `FileNode` of `tree.json`. Implemented only under `--dir`; under `--relay` it returns
  `{ ok: false, error: "metadata unsupported in this runtime" }` → `EXEC_FAILED`.
- In `--dir` mode **always pass `boardId` explicitly** (there is no "current board" context).
- Errors: `EXEC_FAILED`

### 6.12 createFolder (write)
- Parameters: `{ name: string, parentId? }`
- Response: `{ ok: true, folderId, name, parentId }`
- Notes: creates a **folder** node in the tree (no board data written). `parentId` must be an existing folder, otherwise `PARENT_NOT_FOLDER`.
  Omit `parentId` (or pass `null`) to create at the root level.

### 6.13 renameBoard (write)
- Parameters: `{ boardId: string, name: string }` — **both required**
- Response: `{ ok: true, boardId, name, previousName }`
- Notes: changes only `name` (+ `updatedAt`); `parentId`, `order`, board content and trash state are untouched.
  Passing a **folder** id returns `BAD_TYPE` with an actionable hint (`not a board (use renameFolder)`).

### 6.14 renameFolder (write)
- Parameters: `{ folderId: string, name: string }` — **both required**
- Response: `{ ok: true, folderId, name, previousName }`
- Notes: same semantics as `renameBoard`, for folders. Passing a **board** id returns `BAD_TYPE` (`not a folder (use renameBoard)`).

---

## 7. Error codes

| code | Meaning | HTTP analogue |
|---|---|---|
| `BAD_TOKEN` | token mismatch / unauthorized | 401 |
| `BAD_TYPE` | malformed envelope or command body (e.g. missing `cmd` / missing `name` / wrong node kind) | 400 |
| `UNKNOWN_CMD` | command not on the allow-list | 404 |
| `BOARD_NOT_FOUND` | the referenced `boardId` / `folderId` does not exist | 404 |
| `PARENT_NOT_FOLDER` | `createBoard.parentId` is not a folder | 400 |
| `MERMAID_PARSE_FAILED` | Mermaid parse failure / empty input | 422 |
| `PROTOCOL_UNSUPPORTED` | `kbProtocol` negotiation failed | 426 |
| `EXEC_FAILED` | unclassified execution error / capability unavailable in this runtime | 500 |

Error responses are always: `{ kbProtocol, requestId, ok: false, error: { code, message } }`.

---

## 8. Data boundary

> **Board data (JSON) never leaves your machine.** No command in this protocol uploads board content to a remote server.

- `--dir` mode: the server reads and writes the local directory you specify — no relay, no outbound traffic.
- `--relay` mode: the relay listens on **loopback only** (`127.0.0.1`) and is never exposed publicly; it is used solely for same-machine communication.
- No account and no sign-in; there is no "automatically upload board data" capability.

---

## Appendix A · Command → tool name → implementation

| cmd | MCP tool | Implementation |
|---|---|---|
| getBoard | `kbfs_get_board` | `core/executor.ts` |
| getScreenshot | `kbfs_get_screenshot` | `core/executor.ts` (returns `EXEC_FAILED` under `--dir`) |
| listBoards | `kbfs_list_boards` | `core/executor.ts` |
| addElement | `kbfs_add_element` | `core/executor.ts` |
| patchElement | `kbfs_patch_element` | `core/executor.ts` |
| deleteElement | `kbfs_delete_element` | `core/executor.ts` |
| replaceBoard | `kbfs_replace_board` | `core/executor.ts` |
| createBoard | `kbfs_create_board` | `core/executor.ts` |
| createFolder | `kbfs_create_folder` | `core/executor.ts` |
| renameBoard | `kbfs_rename_board` | `core/executor.ts` |
| renameFolder | `kbfs_rename_folder` | `core/executor.ts` |
| deleteBoard | `kbfs_delete_board` | `core/executor.ts` |
| fromMermaid | `kbfs_from_mermaid` | `core/executor.ts` |
| setMetadata | `kbfs_set_metadata` | `core/executor.ts` (implemented under `--dir`; `EXEC_FAILED` under `--relay`) |
| listCapabilities | `kbfs_list_capabilities` | `server/protocol.ts` |
