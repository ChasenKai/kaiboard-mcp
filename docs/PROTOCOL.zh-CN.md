# KaiBoard Agent Protocol（中文）

[English](./PROTOCOL.md) | **简体中文**

> **STATUS**：本文件是 `@kaibuddy/kaiboard-mcp` 的**权威协议文档**。
> 包版本真源：`packages/server/package.json` 的 `version`；协议标识 `kbProtocol` 是**独立的版本轴**，详见 §2。
> 协议版本同样与 KaiBoard 应用版本**相互独立**。
>
> 锚定依据（均实读源码 + 实测，非推测）：
> - 命令真源：`packages/core/src/executor.ts`
> - 传输真源：`packages/server/src/server.ts`（stdio JSON-RPC 2.0，工具前缀 `kbfs_*`）
> - 信封 / 错误码：`packages/server/src/protocol.ts`

---

## 0. 范围与定位

本协议定义 **Agent ↔ KaiBoard** 的逻辑指令契约（命令集 + 信封 + 版本与能力协商 + 错误码 + 数据边界）。

**传输无关（transport-agnostic）**：同一套逻辑命令可绑定到不同传输。

| 绑定 | 启动方式 | 传输 | 说明 |
|---|---|---|---|
| **relay（`--relay`）· 主推** | `kaiboard-mcp --relay` | 本机 HTTP 中继（`127.0.0.1`） | 驱动**正在运行**的 KaiBoard 页面；需用户已启用「Agent 共绘」 |
| **local（`--dir`）** | `kaiboard-mcp --dir <文件夹>` | 直读直写本地目录 | 服务端进程内嵌存储适配器（`fsStorageAdapter`），不依赖应用、不依赖中继 |

> **单包双能力、可叠加**：两种方式同属 `@kaibuddy/kaiboard-mcp`，可同时启用（`--relay --dir <path>`），工具前缀统一为 `kbfs_*`。
> 协议规定「命令说什么 / 回什么」，不规定「走哪条线」；两种绑定都必须满足本协议的信封与语义。

---

## 1. 信封（Envelope）

### 1.1 请求

```jsonc
{
  "kbProtocol": "1.0",     // 可选：不填则服务端按默认版本处理；填则参与协商（见 §2）
  "requestId": "uuid-v4",  // 可选：不填由服务端生成（将失去幂等回放能力，见 §3）
  "cmd": "getBoard",       // 命令之一（见 §6）；MCP 工具名见 §1.4
  "token": "24-hex",       // --dir 模式可省略（本地无远程）；relay 模式必填
  // ...命令专属参数（见各命令节）
}
```

### 1.2 响应

```jsonc
{
  "kbProtocol": "1.0",
  "requestId": "uuid-v4",  // 原样回显，供客户端配对
  "ok": true,
  "result": { /* 命令专属 */ }
}
// 或失败：
{
  "kbProtocol": "1.0",
  "requestId": "uuid-v4",
  "ok": false,
  "error": { "code": "BOARD_NOT_FOUND", "message": "..." }
}
```

### 1.3 传输包裹（MCP 绑定）

- 请求经 JSON-RPC 2.0 `tools/call` 包裹：`params.arguments` 即 §1.1 的协议请求体字段。
- 响应在 `result.content[0].text`（JSON 字符串），客户端 `JSON.parse` 后得到 §1.2 的响应对象。
- `initialize` 走 MCP 标准握手（`protocolVersion: "2024-11-05"`）；`params.arguments.kbProtocol` 可携带本协议版本做二次协商。
- `--dir` 绑定时，服务端进程内直接调用 core 执行器，返回本协议响应对象。

### 1.4 MCP 工具命名

- 命令 → 工具名映射：**`kbfs_` + camelCase 转 snake_case**。
  例：`getBoard` → `kbfs_get_board`；`addElement` → `kbfs_add_element`；`replaceBoard` → `kbfs_replace_board`。
- 能力声明工具：`kbfs_list_capabilities`。
- `tools/list` 共返回 **12 个工具**（11 个命令 + `kbfs_list_capabilities`）。
- 各工具 `inputSchema.properties` 含
  `kbProtocol / requestId / token / boardId / elements / patches / ids / name / parentId / mermaid / source / opts / metadata`，`required: []`（按需填，缺省走默认语义）。

---

## 2. 版本协商

`kbProtocol` 是**独立于包版本的协议轴**（与 `@kaibuddy/kaiboard-mcp` 的版本号解耦）；也区别于跟随官方 MCP SDK 的通用协议版本 `2024-11-05`。

- **兼容规则：主版本号一致即兼容。** 服务端为 `1.x` 时，任何 `1.x` 客户端都被接受。
- 客户端**可省略** `kbProtocol`（服务端按当前默认处理，便于宽松接入）。
- 若携带：
  - 与服务端主版本一致（如客户端 `1.0` / `1.3`，服务端 `1.0`）→ 正常执行；
  - 主版本不同（如 `2.0`，或 1.0 之前的取值 `0.1.1`）→ `error.code = "PROTOCOL_UNSUPPORTED"`。
- **次版本 / 修订版本升级不会打断客户端。** 新增命令、新增可选字段都**不**提升 `kbProtocol` 主版本 —— 因此包版本在 `0.x` / `1.x` 内迭代对既有接入是安全的。
- **主版本**提升（如 `1.x` → `2.0`）只保留给真正的不兼容变更：删除或重命名命令、改变参数含义、把可选字段改为必填。

> **不要照抄示例里的 `kbProtocol` 数值。** 代码片段中的版本只是示意。可以省略不填；若填，填你的客户端开发时对应的版本即可 —— 服务端只校验主版本号。

**什么算破坏性变更**（主版本号唯一会变动的理由）：

- 删除或重命名命令 / 工具，或删除必填参数
- 改变既有参数的**含义**（同名但语义变了 —— 最隐蔽的一类）
- 删除返回字段，或改变字段类型
- 把此前可选的字段改为必填
- 改变默认行为（省略参数的调用结果不一样了）

**不算破坏性**（走次版本 / 修订版本，`kbProtocol` 不变）：新增命令、新增可选参数、新增返回字段、修 bug、文案调整、性能优化。


---

## 3. 幂等（requestId 去重）

- `requestId` 由客户端生成，推荐稳定 UUID（`crypto.randomUUID()`）。**不填则服务端自动生成，该次调用不参与去重。**
- 服务端维护近期 `requestId` 缓存；收到**已见过**的 `requestId` → **直接回放原响应**，不重复执行写操作。
- 用途：写类命令在网络超时重试时，用**同一 `requestId`** 可避免双写。
- 客户端纪律：重试必须沿用同一 `requestId`；若要强制重做，须换新 `requestId`。

---

## 4. 能力协商（listCapabilities）

`kbfs_list_capabilities` 返回：

```jsonc
{
  "kbProtocol": "1.0",
  "commands": [                      // 命令白名单（11 条）
    "getBoard", "getScreenshot", "listBoards", "addElement",
    "patchElement", "deleteElement", "replaceBoard", "createBoard",
    "createFolder", "renameBoard", "renameFolder",
    "deleteBoard", "fromMermaid", "setMetadata"
  ],
  "storageModes": ["idb", "fs", "dir", "relay"],
  "activeStorageMode": "relay",       // 当前实际生效的绑定
  "snapshot": { "max": 20 },          // replaceBoard 自动快照上限
  "serverInfo": { "name": "kaiboard-mcp", "version": "<包版本>" },
  "relayAvailable": true,             // 中继进程是否已起
  "dirAvailable": false,              // 离线文件夹后端是否可用
  "pageConnected": true,              // 是否真的有 KaiBoard 页面连着
  "relayFolder": "KaiBoardFolder",    // 页面当前文件夹名；不可达 = null
  "dirWarnings": []                   // 非空 = 配置不一致，Agent 应先提示用户
}
```

**几个字段的语义，接入时务必分清：**

- `relayAvailable` 只表示**中继进程起来了**，**不等于页面已连上**；判断「真的能写」要看 `pageConnected`。
- `pageConnected` 有时间窗（覆盖一次长轮询 + 重连间隔），页面刚关闭的短时间内可能仍报 `true`。
- `dirWarnings` 非空表示 `--dir` 的工作目录与 KaiBoard 当前文件夹**不是同一个**，此时 Agent 写入的内容需要用户在应用内显式导入才可见 —— 应先提示用户，再继续写入。

---

## 5. 存储模式（storageModes）

| mode | 含义 | 落盘 / 可见性 |
|---|---|---|
| `dir` | `--dir` 模式，Agent 工作文件夹 | `boards/<id>.json` + `tree.json`；可读名经 `tree.json` 映射 |
| `fs` | 应用「本地文件夹」存储（File System Access API） | `kaiboard-data/boards/<id>.json` + `tree.json`，落盘即见 |
| `idb` | 浏览器 IndexedDB（应用默认存储） | 仅当前页面可见 |
| `relay` | 经本机中继驱动运行中的页面 | 由页面按用户所选存储落盘 |

**`--dir` 的落盘格式**：以 `boards/<id>.json`（BoardData）+ `tree.json`（文件树）为主存储，
**不是**「一个 `.excalidraw` 文件 = 一个画板」。`.excalidraw` 仅用于导入导出等互操作场景。
`tree.json` 即清单文件，画板级元数据（状态 / 版本 / 历史 / 批注）扩展在其 `FileNode` 上。

---

## 6. 命令集

> **寻址**：所有画板级命令接受可选 `boardId`。
> - 缺省或等于当前打开画板 → 走实时 API（可撤销、即时重绘）。
> - 显式指定其它 `boardId` → 直写存储（不切画布），写完通知界面刷新树。
>
> **溯源**：写类命令可带 `source: { kind, text }`，落到新元素 `customData.__kbSource`，`getBoard` 可原样回读。

### 6.1 getBoard（读）
- 参数：`{ boardId? }`
- 响应：`{ boardId: string|null, elements: Element[] }`
- 说明：目标不存在时返回**空数组**（不报错）。`BOARD_NOT_FOUND` 在本绑定为保留码（见 §8）。

### 6.2 getScreenshot（读）
- 参数：`{ boardId?, opts?: { maxWidthOrHeight?, background?, darkMode? } }`
- 行为：
  - **空画板** → `{ ok: true, empty: true, dataUrl: null, boardId }`（成功，非错误）
  - **非空 + 有渲染能力**（`--relay`，由页面注入渲染）→ `{ ok: true, mimeType: "image/png", bytes, dataUrl }`
  - **非空 + 无渲染能力**（`--dir`，纯 Node 无 canvas）→ `{ ok: false, error: "screenshot unsupported in this runtime" }` → 错误码 `EXEC_FAILED`
- 错误（保留）：`BOARD_NOT_FOUND`

### 6.3 listBoards（读）
- 参数：`{}`
- 响应：`{ activeBoardId: string|null, nodes: [{ id, type: "board"|"folder", name, parentId, updatedAt }] }`

### 6.4 addElement（写）
- 参数：`{ elements: Element | Element[], boardId?, source? }`
- 响应：`{ ok: true, added: number, ids: string[] }`（`ids` 为稳定元素 id，供后续 patch / delete）
- 说明：非空画板默认把新元素整体下移到现有内容下方（避免重叠）；`elements` 为空时返回 `added: 0`（不报错）。
- 元素属性：填充色可写短名 `fill`（等价 `backgroundColor`），描边可写 `stroke`（等价 `strokeColor`）。

### 6.5 patchElement（写）
- 参数：`{ patches: { id, ...属性 } | { id, ...属性 }[], boardId? }`
- 响应：`{ ok: true, patched: number, missing: string[] }`（`missing` = 不存在的 id）
- 说明：按 id 局部合并属性，保留原 `id`；`patches` 为空时返回 `patched: 0`。

### 6.6 deleteElement（写）
- 参数：`{ ids: string | string[], boardId? }`
- 响应：`{ ok: true, deleted: number, missing: string[] }`

### 6.7 replaceBoard（写）
- 参数：`{ elements: Element[], boardId?, source? }`
- 响应：`{ ok: true, replaced: number }`
- 说明：**自动快照**（上限 20，供还原）。

### 6.8 createBoard（写）
- 参数：`{ name?, parentId?, elements?, source? }`
- 响应：`{ ok: true, boardId, name, added: number }`
- 说明：直写存储（不切画布）；`parentId` 必须是文件夹，否则 `PARENT_NOT_FOLDER`。

### 6.9 deleteBoard（写）
- 参数：`{ boardId }`（**必填**）
- 响应：`{ ok: true, deleted: 1, boardId, name, trashed: true }`
- 说明：**软删除**（进入回收站，可在应用内还原）。约束：只接受画板（文件夹请在应用内操作）；**拒绝删除当前正打开的画板**（需先切换）。`--dir` 绑定暂不支持 → 返回 `unsupported`。

### 6.10 fromMermaid（写）
- 参数：`{ mermaid: string, boardId?, opts?: { replace?, fontSize? }, source? }`
- 响应：`{ ok: true, replaced|added, fromMermaid: true, files?: number }`
- 说明：Mermaid 源码 → 原生可编辑图元；`opts.replace` 为整板替换（自动快照），否则追加。`source.kind` 自动置 `"mermaid"`。
- **依赖注**：需要可选依赖 `@excalidraw/mermaid-to-excalidraw`。缺失时（如 `--dir` 未安装）返回**可读的行动提示**（建议改走 `--relay`）。
- 错误：`MERMAID_PARSE_FAILED`

### 6.11 setMetadata（写）
- 参数：`{ boardId?, metadata: { status?, version?, history?, comments? } }`
  - `status?`：状态字符串（如 `draft` / `review` / `done`）
  - `version?`：自增版本号（number）
  - `history?`：**整段替换**的版本历史数组 `{ ts, version, note? }[]`
  - `comments?`：**整段替换**的批注数组
- 响应：`{ ok: true, boardId }`
- 说明：元数据合并写回 `tree.json` 的 `FileNode`。仅 `--dir` 绑定实现；`--relay` 下返回
  `{ ok: false, error: "metadata unsupported in this runtime" }` → `EXEC_FAILED`。
- `--dir` 模式请**始终显式传 `boardId`**（该模式无「当前画板」上下文）。
- 错误：`EXEC_FAILED`

### 6.12 createFolder（写）
- 参数：`{ name: string, parentId? }`
- 响应：`{ ok: true, folderId, name, parentId }`
- 说明：在文件树里建一个**文件夹**节点（不写画板数据）。`parentId` 必须是已存在的文件夹，否则 `PARENT_NOT_FOLDER`。
  省略 `parentId`（或传 `null`）表示建在根层。

### 6.13 renameBoard（写）
- 参数：`{ boardId: string, name: string }` —— **两项都必填**
- 响应：`{ ok: true, boardId, name, previousName }`
- 说明：只改 `name`（与 `updatedAt`）；不动 `parentId`、`order`、画板内容与回收站状态。
  若传入的是**文件夹** id，返回 `BAD_TYPE` 并给出可执行提示（`not a board (use renameFolder)`）。

### 6.14 renameFolder（写）
- 参数：`{ folderId: string, name: string }` —— **两项都必填**
- 响应：`{ ok: true, folderId, name, previousName }`
- 说明：语义同 `renameBoard`，作用于文件夹。若传入的是**画板** id，返回 `BAD_TYPE`（`not a folder (use renameBoard)`）。

---

## 7. 错误码

| code | 含义 | HTTP 类比 |
|---|---|---|
| `BAD_TOKEN` | token 不匹配 / 未授权 | 401 |
| `BAD_TYPE` | 信封或命令体畸形（如缺失 `cmd` / 缺失 `name` / 节点类型不对） | 400 |
| `UNKNOWN_CMD` | 命令不在白名单 | 404 |
| `BOARD_NOT_FOUND` | 引用的 `boardId` / `folderId` 不存在 | 404 |
| `PARENT_NOT_FOLDER` | `createBoard.parentId` 不是文件夹 | 400 |
| `MERMAID_PARSE_FAILED` | Mermaid 解析失败 / 空内容 | 422 |
| `PROTOCOL_UNSUPPORTED` | `kbProtocol` 协商失败 | 426 |
| `EXEC_FAILED` | 执行期未归类异常 / 当前运行时不支持的能力 | 500 |

错误响应统一为：`{ kbProtocol, requestId, ok: false, error: { code, message } }`。

---

## 8. 数据边界

> **画板数据（JSON）不会离开本机。** 本协议的任何命令都不把画板内容传到远程服务器。

- `--dir` 模式：服务端进程直读直写你指定的本地目录，无中继、无上行。
- `--relay` 模式：中继仅监听 `127.0.0.1` 本地环回，不暴露公网，只用于同机通信。
- 无需账号、无需登录；不提供任何「自动把画板数据上传服务器」的能力。

---

## 附录 A · 命令 → 工具名 → 实现位置

| cmd | MCP 工具名 | 实现位置 |
|---|---|---|
| getBoard | `kbfs_get_board` | `core/executor.ts` |
| getScreenshot | `kbfs_get_screenshot` | `core/executor.ts`（`--dir` 返回 `EXEC_FAILED`） |
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
| setMetadata | `kbfs_set_metadata` | `core/executor.ts`（`--dir` 实现；`--relay` 返回 `EXEC_FAILED`） |
| listCapabilities | `kbfs_list_capabilities` | `server/protocol.ts` |
