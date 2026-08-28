# KaiBoard Agent Protocol v2（定稿 · v1.0.0）

> **STATUS**：本文件即 **KaiBoard-MCP 仓（`kaiboard/agent/mcp/`）的权威协议文档**，随 `@kaiboard/mcp-server` 首发版（v1.0.0）生效。
> 历史草稿见 `kaiboard/agent/internal/PROTOCOL-v2-draft.md`（仅作演进记录，以本文件为准）。
> 终端用户帮助（KaiBoard + Agent 怎么用 / MCP 设置 / token）另放 **www.kaibuddy.com 帮助站**，不进本协议仓库。
> 版本真源：`@kaiboard/mcp-server` 的 `package.json`；本协议随首发版生效，与 KaiBoard app 版本（v1.0.0-beta.x）解耦。
>
> 锚定依据（已实读源码 + 实测，非凭空）：
> - 命令真源：`packages/core/src/executor.ts`（10 命令 + 参数/响应形状）
> - 传输真源：`packages/server/src/server.ts`（stdio JSON-RPC 2.0；MCP 工具前缀 `kbfs_*`）
> - 协议信封/错误码：`packages/server/src/protocol.ts`
> - F1=A 零云：执行手册 §1 红线 + 架构 §7
>
> **本文件不修改外援 `kaiboard-other/` 任何文件。**

---

## 0. 范围与定位

本协议定义 **Agent ↔ KaiBoard** 的逻辑指令契约（命令集 + 信封 + 版本/能力协商 + 错误码 + 红线）。
**传输无关（transport-agnostic）**：同一套逻辑命令，可绑定不同传输：

| 绑定 | 触发 | 传输 | 实现 | 说明 |
|---|---|---|---|---|
| **local（`--dir`）** | `kaiboard-mcp --dir <文件夹>` | 直读直写本地目录（无页面、无中继） | **`@kaiboard/mcp-server`**（本仓） | Agent 进程内嵌 StorageAdapter（`fsStorageAdapter`）；落板即见（fs 对齐格式）。**M1-3 产品主线** |
| **relay（`--relay`）** | `kaiboard-mcp --relay` | HTTP（本地 `127.0.0.1` 中继，页面已授权） | **`@kaiboard/mcp-server`**（同一包，内建 `relay-runtime.ts`，吸收原 bridge-relay + Companion） | 工具前缀 `kbfs_*`；需用户开页面 + 「Agent 共绘」ON。**可与 `--dir` 叠加（非互斥）** |

> **单包双能力、可叠加**：`--relay`（实时共绘，主）与 `--dir`（离线文件夹资产库，可选）同属 `@kaiboard/mcp-server`，可同时启用；`--relay` 模式下 `idb`/`fs` 由运行中的 app 经中继提供。旧 `kaiboard-bridge` / `mcp-bridge.mjs` / `bridge-relay.mjs` / `KaiBoard-Relay.exe` 已于 2026-08-28 退役删除，不存在第二套 server。
> 协议规定"命令说什么/回什么"，不规定"走哪条线"。两种绑定都必须满足本协议的信封与语义。

---

## 1. 信封（Envelope）

### 1.1 请求
```jsonc
{
  "kbProtocol": "1.0.0",           // 可选：不填=服务端按默认版本处理；填则参与协商（见 §2）
  "requestId": "uuid-v4",         // 可选：不填服务端自动生成（将失去幂等回放能力，见 §3）
  "cmd": "getBoard",              // 10 命令之一（见 §6）；MCP 工具名见 §1.4
  "token": "24-hex",              // --dir 模式可省略（本地无远程）；relay 模式必填
  // ...命令专属参数（见各命令节）
}
```

### 1.2 响应
```jsonc
{
  "kbProtocol": "1.0.0",
  "requestId": "uuid-v4",         // 原样回显，供客户端配对
  "ok": true,
  "result": { /* 命令专属 */ }
}
// 或失败：
{
  "kbProtocol": "1.0.0",
  "requestId": "uuid-v4",
  "ok": false,
  "error": { "code": "BOARD_NOT_FOUND", "message": "..." }
}
```

### 1.3 传输包裹（MCP 绑定）
- 请求经 JSON-RPC 2.0 `tools/call` 包裹：`method="tools/call"`，`params.arguments` 内含本协议请求体（即 §1.1 的字段直接作为 `arguments`）。
- 响应在 `result.content[0].text`（JSON 字符串），客户端 `JSON.parse` 后得到 §1.2 的协议响应对象。
- `initialize` 走 MCP 标准握手（返回 `protocolVersion: "2024-11-05"`），但 `params.arguments.kbProtocol` 可携带本协议版本做二次协商。
- `local` 绑定：MCP server 进程内直接调用 Core executor，返回本协议响应对象（无额外 JSON-RPC 包裹在结果内部）。

### 1.4 MCP 工具命名（`--dir` 绑定）
- 命令 → 工具名映射：**`kbfs_` + camelCase 转 snake_case**。
  - 例：`getBoard` → `kbfs_get_board`；`addElement` → `kbfs_add_element`；`replaceBoard` → `kbfs_replace_board`；`fromMermaid` → `kbfs_from_mermaid`。
- 能力声明工具：`kbfs_list_capabilities`（一等命令，非 MCP 标准 capabilities 的替代）。
- `tools/list` 共返回 **11 个 tool**（10 命令 + `kbfs_list_capabilities`）。
- 各工具 `inputSchema` 的 `properties` 含 `kbProtocol / requestId / token / boardId / elements / patches / ids / name / parentId / mermaid / source / opts / metadata`，`required: []`（字段按需填，缺省走默认语义）。

---

## 2. 版本协商（kbProtocol = KaiBoard-MCP 服务端版本）

`kbProtocol` **跟随 `@kaiboard/mcp-server` 版本号**（不单列第三根轴；区别于 KaiBoard app 版本与 MCP 通用版本 `2024-11-05`）。当前服务端 `package.json` 为 `1.0.0` 时，`kbProtocol: "1.0.0"`。

- **客户端可省略 `kbProtocol`**（服务端按默认 `1.0.0` 处理，宽松接入）。
- 若客户端携带 `kbProtocol`：
  - 命中 `1.0.0` → 正常执行；
  - 其它值（如 `0.9.0`）→ 返回 `error.code = "PROTOCOL_UNSUPPORTED"`（实测已验：e2e PartB）。
- 向后兼容规则：次版本号（1.x）内可加命令、可加可选字段；主版本号变更（2.0）才允许删/改破坏性字段。

---

## 3. 幂等（requestId 去重）

- `requestId` 由客户端生成；**推荐用稳定 UUID**（`crypto.randomUUID()` 一类）。**若不填，服务端自动生成随机 UUID → 该次调用不参与去重**。
- 服务端维护近期 `requestId` 缓存（`IdempotencyCache`）；收到**已见过的 `requestId`** → **直接回放原响应**，不重复执行写操作。
- 用途：写类命令（addElement/patch/delete/replace/create/fromMermaid）在网络超时重试时，用**同一 `requestId`** 可避免双写（实测已验：e2e PartB 同 `R1` 回放、tree 节点不翻倍）。
- **客户端纪律**：重试必须用同一 `requestId` 才能去重；若想强制重做，必须换新 `requestId`。

---

## 4. 能力协商（listCapabilities）

`listCapabilities` 是一等命令（`kbfs_list_capabilities`）：

```jsonc
// 请求
{ "kbProtocol": "1.0.0", "requestId": "uuid", "cmd": "listCapabilities" }

// 响应 result
{
  "kbProtocol": "1.0.0",
  "commands": [                      // 10 命令白名单
    "getBoard","getScreenshot","listBoards","addElement",
    "patchElement","deleteElement","replaceBoard","createBoard","fromMermaid",
    "setMetadata"
  ],
  "widget": { "supported": false, "reason": "M2.5 未实现宿主，协议形态已预留（见 §7）" },
  "storageModes": ["idb", "fs", "dir"],   // 见 §5（注意当前 --dir server 仅实绑 dir）
  "snapshot": { "max": 20 },              // replaceBoard 自动快照上限
  "serverInfo": { "name": "kaiboard-mcp", "version": "1.0.0" },
  // M2-3① 配置一致性探测（启动时 best-effort 探测 relay /info）
  "relayFolder": "KaiBoardFolder" | null, // KaiBoard 当前文件夹名（relay 可达且有 folder 时）；不可达/未配置= null
  "dirWarnings": [                         // 非空=配置不一致，Agent 必须提示用户
    "Agent 工作目录(--dir=...) 与 KaiBoard 当前文件夹(...) 不一致：Agent 写入的内容需用户在 KaiBoard 中显式导入才可见；建议把 --dir 指向 KaiBoard 当前文件夹，或在 KaiBoard 设置里将存储文件夹设为同一目录。"
  ]
}
```

**`relayFolder` / `dirWarnings`（M2-3①，2026-08-25 新增）**：server 启动时按 `--relay`（默认 `http://127.0.0.1:8787`）best-effort 探测 KaiBoard 中继 `/info`，取其中的 `folder`（当前文件夹名）。将 `--dir` 的末段（basename）与 `folder` 比对：
- 一致 → `dirWarnings` 为空，Agent 可放心直写、落板即见。
- 不一致（或 `--dir` 末段 ≠ `folder`）→ `dirWarnings` 含一条明确行动指引（提示「写入后需显式导入才可见」+ 降级显式落板）。
- relay 不可达（未运行 app / 未开 Agent 共绘）→ `relayFolder=null` 且 `dirWarnings` 为空（**静默，不阻塞**——用户可能故意不跑 app）。

> 约束：浏览器 `FileSystemDirectoryHandle` 不暴露真实路径，relay `/info` 只能给**文件夹名**（非绝对路径），故一致性探测比 **basename** 而非全路径。Agent 侧 `--dir` 的真实路径仍需用户/宿主显式配置。

Agent 应先用 `listCapabilities` 探测：若 `dirWarnings` 非空，先提示用户再继续写入。

---

## 5. 存储模式（storageModes）

| mode | 含义 | 寻址/可见性 | 当前 `@kaiboard/mcp-server` 实绑 |
|---|---|---|---|
| `dir` | `--dir` 模式，Agent 工作文件夹（**fs 对齐格式**） | `boards/<id>.json` + `tree.json`；可读名经 tree.json 映射，Agent 只见名字不见 UUID | ✅ **已实绑（M1-3 主线）** |
| `fs` | KaiBoard「本地文件夹」设置（File System Access API，Chromium） | `kaiboard-data/boards/<id>.json` + `tree.json`；落板即见 | ⏳ 经 relay（`--relay`）由运行中的 app 提供 |
| `idb` | 浏览器 IndexedDB（默认，无账号无云） | 仅当前页面可见；Agent 写后需用户操作/切前台才刷新 | ⏳ 同上（relay 绑定） |

**格式铁律（B1/B2 落定）**：`--dir` **主存储 = fs 对齐格式**（`boards/<id>.json` BoardData + `tree.json` 文件树），**不是**"每个 `.excalidraw` 文件=一个画板"。`.excalidraw` / `.kbmeta.json` 仅用于导入导出/交互卡等**互操作场景**，不用于 --dir 的实时存储。`tree.json` 即 manifest，元数据（title/status/version/history）扩展 `tree.json` 的 `FileNode`，不单建 `manifest.json`。

> **实现注**：`listCapabilities` 仍广告 `idb/fs/dir` 三种模式（协议层面支持），但 `@kaiboard/mcp-server` 当前 `--dir` 模式实绑 `dir`；`idb`/`fs` 由**同一 `@kaiboard/mcp-server`** 在 `--relay` 模式（驱动运行中的 KaiBoard app）下提供，并非独立 server。这不影响协议正确性——协议是传输无关的，两种绑定各自落地。

---

## 6. 命令集（10 命令 · 参数/响应/错误）

> 寻址（N3）：所有画板级命令接受可选 `boardId`。
> - 缺省 / = 当前打开画板 → 走实时 API（可撤销、即时重绘）。
> - 显式 `boardId` → 直写存储（不切画布，规避 canvas 竞态），写完广播树变更事件。
> 溯源（C4）：写类命令可带 `source: { kind, text }`，落到新元素 `customData.__kbSource`，`getBoard` 原样回读。

### 6.1 getBoard（读）
- 参数：`{ boardId? }`
- 响应：`{ boardId: string|null, elements: Element[] }`（`boardId` 在 --dir 无当前画板上下文时可能为 `null`）
- 说明：读目标画板元素；目标不存在时返回**空数组**（不报错）。`BOARD_NOT_FOUND` 在本绑定为保留码（见 §8）。

### 6.2 getScreenshot（读 · P0.5 视觉读）
- 参数：`{ boardId?, opts?: { maxWidthOrHeight?, background?, darkMode? } }`
- 行为（实测语义，比草稿更精确）：
  - **空画板** → `{ ok: true, empty: true, dataUrl: null, boardId }`（成功，非错误）
  - **非空 + 有渲染能力**（relay/app 绑定注入了 `renderPng`）→ `{ ok: true, mimeType: "image/png", bytes, dataUrl }`
  - **非空 + 无渲染能力**（`--dir` 绑定，`fsStorageAdapter` 未注入 `renderPng`）→ `{ ok: false, error: "screenshot unsupported in this runtime" }` → 协议错误码 **`EXEC_FAILED`**（实测已验：e2e PartB）
- 错误（保留）：`BOARD_NOT_FOUND`

### 6.3 listBoards（读 · N2 寻址）
- 参数：`{}`
- 响应：`{ activeBoardId: string|null, nodes: [{ id, type: "board"|"folder", name, parentId, updatedAt }] }`

### 6.4 addElement（写）
- 参数：`{ elements: Element | Element[], boardId?, source? }`
- 响应：`{ ok: true, added: number, ids: string[] }`（ids 为稳定元素 id，供后续 patch/delete）
- 说明：非空画板自动 `#41 防重叠`（新元素整体下移到现有内容下方 +80 间距）；`source` 写入 `customData.__kbSource`。`elements` 为空时返回 `added:0`（不报错）。

### 6.5 patchElement（写 · N1）
- 参数：`{ patches: { id, ...属性 } | { id, ...属性 }[], boardId? }`
- 响应：`{ ok: true, patched: number, missing: string[] }`（`missing` = 不存在的 id）
- 说明：按 id 局部合并属性，保留原 `id`；触发 `versionNonce` 更新。`patches` 为空时返回 `patched:0`。

### 6.6 deleteElement（写 · N4）
- 参数：`{ ids: string | string[], boardId? }`
- 响应：`{ ok: true, deleted: number, missing: string[] }`
- 说明：`ids` 为空时返回 `deleted:0`。

### 6.7 replaceBoard（写 · 敏感）
- 参数：`{ elements: Element[], boardId?, source? }`
- 响应：`{ ok: true, replaced: number }`
- 说明：**自动快照**（≤20，供还原，`SNAPSHOT_KEY` 存于存储适配器）+ 经 `onActivity` 回调透明提示。

### 6.8 createBoard（写 · A1）
- 参数：`{ name?, parentId?, elements?, source? }`
- 响应：`{ ok: true, boardId, name, added: number }`
- 说明：直写存储（不切画布）；`parentId` 必须是 folder，否则 `PARENT_NOT_FOLDER`；缺省名 `"Agent 画板"`。

### 6.9 fromMermaid（写 · C5/P1）
- 参数：`{ mermaid: string, boardId?, opts?: { replace?, fontSize? }, source? }`
- 响应：`{ ok: true, replaced|added, fromMermaid: true, files?: number }`
- 说明：Mermaid 源码 → 原生可编辑 Excalidraw 图元；`opts.replace` 整板替换（自动快照），否则追加。`source.kind` 自动置 `"mermaid"`。
- **依赖注（`--dir` 绑定）**：需显式安装 peer 依赖 `@excalidraw/mermaid-to-excalidraw`（及其 `mermaid` 依赖），否则动态 import 失败 → 返回**可被 Agent 直接读懂的行动提示**（建议改走 `kaiboard-mcp --relay` 驱动运行中的 app 以使用本命令）。
- 错误：`MERMAID_PARSE_FAILED`（空 mermaid 或解析失败）

### 6.10 setMetadata（写 · M2-2 画板级元数据）
- 参数：`{ boardId?, metadata: { status?, version?, history?, comments? } }`
  - `status?`：画板状态字符串（如 `draft` / `review` / `done`）。
  - `version?`：自增版本号（number）。
  - `history?`：**整段替换**的版本历史数组 `{ ts, version, note? }[]`（调用方自管历史数组；如需追加请读取现有 history 后拼接再整体回传）。
  - `comments?`：**整段替换**的批注/回环评论数组。
- 响应：`{ ok: true, boardId }`
- 说明：把元数据合并写回 `tree.json` 的 `FileNode`（落板即见）。仅 `--dir` 绑定实现 `setMetadata`；relay（`--relay`）模式下当前未实现该命令，返回 `{ ok: false, error: "metadata unsupported in this runtime" }` → 协议错误码 `EXEC_FAILED`。
- 寻址：缺省 `boardId` 且当前运行无「当前画板」上下文（`--dir` 模式）时 → 返回 `{ ok: false, error: "setMetadata requires boardId ..." }`（`EXEC_FAILED`）。`--dir` 模式请始终显式传 `boardId`。
- 错误：`EXEC_FAILED`（运行时不支持 / 缺 boardId / 节点不存在）。

---

## 7. Widget 协议形态（M2.5 预留 · 不实现宿主）

协议**预留**以下命令形态，当期（v1.0.0）不实现宿主（WorkBuddy 已实测不支持 MCP Apps widget 渲染），仅留语义边界：

| 命令 | 语义 | 与存储层关系 |
|---|---|---|
| `create_view` | 在会话内渲染一个**临时视图**（画板/卡片预览） | **渲染层，不落存储**；关闭即弃 |
| `save_checkpoint` | 把当前视图/画板状态存为本机 checkpoint 文件 | 本机文件存储，**不联网** |
| `read_checkpoint` | 读回 checkpoint | 本机 |
| `commit_to_board` | 把视图/checkpoint 提交为正式画板 | 经 `createBoard`/`replaceBoard` 落存储 |

**关键语义边界（务必写死）**：`create_view`（渲染层） **≠** `create_board`（存储层）。视图是临时的、可丢弃的；画板是持久资产。Agent 不得把"已 create_view"误当"已落板"。

---

## 8. 错误码（标准化）

| code | 含义 | HTTP 类比 | 当前 `@kaiboard/mcp-server` 实返 |
|---|---|---|---|
| `BAD_TOKEN` | token 不匹配 / 未授权 | 401 | ⏳ relay 绑定由 `kaiboard-mcp --relay` 校验 |
| `BAD_TYPE` | 信封/命令体畸形（如缺失 `cmd`） | 400 | ✅ `executeCommand` 对空 `cmd` 返回 `bad command` → 映射 `BAD_TYPE` |
| `UNKNOWN_CMD` | 命令不在白名单 | 404 | ✅ `TOOL_TO_CMD` 未命中 / core `unknown cmd` |
| `BOARD_NOT_FOUND` | `boardId` 指向不存在的画板 | 404 | 保留（当前 core 对缺失 board 返回空数组而非报错；relay 绑定可能强校验） |
| `PARENT_NOT_FOLDER` | `createBoard.parentId` 非 folder | 400 | ✅ `parent folder not found` |
| `MERMAID_PARSE_FAILED` | Mermaid 解析失败 / 空 mermaid | 422 | ✅ |
| `PROTOCOL_UNSUPPORTED` | `kbProtocol` 协商失败 | 426 | ✅ 非 `1.0.0` |
| `EXEC_FAILED` | 执行期未归类异常 / 本运行时不支持的能力（如 --dir 非空板 getScreenshot） | 500 | ✅ |

所有错误响应统一：`{ kbProtocol, requestId, ok: false, error: { code, message } }`。

---

## 9. 红线 · F1=A 零云（D4 硬约束）

> **用户画板数据（JSON）绝不离开本机。** 本协议任何命令都**不**传输画板内容到远程服务器。

- 仅允许托管**程序代码**（widget 容器 / 交互卡模板 / 官网——应用层）。
- 任何"自动把画板数据传服务器"的设计（云端 MCP / 云端 checkpoint / 云端同步）**不做**。
- **widget 公域托管（M2.5，kaibuddy.com）硬约束**：交互卡/视图的画板 JSON **必须本地渲染、不上传**；公域只托管渲染器代码与模板，画板数据始终在用户机器。违反即破 F1=A。
- `--dir` 模式天然零云（Agent 进程直读本地目录，无中继、无上行）。
- 中继（`--relay`）仅在 `127.0.0.1` 本地环回，不暴露公网。

---

## 10. 验收标准（M1-1 · 已达成）

- [x] 本文档完整：任意 Agent 读一份即可适配（命令/信封/版本/能力/错误码/红线全覆盖）。
- [x] `@kaiboard/mcp-server` 的 `tools/list` 与本文档 §6 命令集**一致**（实测 11 tool = 10 命令 + `kbfs_list_capabilities`）。
- [x] 实现 `requestId` 去重（§3）与 `kbProtocol` 协商（§2）（实测 e2e PartB 全绿）。
- [x] 文档随 KaiBoard-MCP 首发版进独立仓库 `docs/PROTOCOL-v2.md`（即本文件）；开发期草稿留 `kaiboard/agent/internal/PROTOCOL-v2-draft.md` 作演进记录。
- [x] `npm run build` 通过 + `npm run e2e` **PASS=38/FAIL=0** + `npm run smoke` **PASS=21/FAIL=0**（2026-08-26 实测；含 M2-2 `setMetadata` 10 命令 + M2-3① 配置一致性探测 partC）。

---

## 附录 A · 命令 → 工具名 → 实现对照

| cmd | MCP 工具名（`--dir` 绑定） | 实现位置 |
|---|---|---|
| getBoard | `kbfs_get_board` | `core/executor.ts` getBoard |
| getScreenshot | `kbfs_get_screenshot` | core getScreenshot（--dir 返回 EXEC_FAILED） |
| listBoards | `kbfs_list_boards` | core listBoards |
| addElement | `kbfs_add_element` | core addElement |
| patchElement | `kbfs_patch_element` | core patchElement |
| deleteElement | `kbfs_delete_element` | core deleteElement |
| replaceBoard | `kbfs_replace_board` | core replaceBoard |
| createBoard | `kbfs_create_board` | core createBoard |
| fromMermaid | `kbfs_from_mermaid` | core fromMermaid |
| setMetadata | `kbfs_set_metadata` | core setMetadata（`--dir` 实现；relay 模式未实现 → EXEC_FAILED） |
| listCapabilities | `kbfs_list_capabilities` | `server/protocol.ts` listCapabilitiesResult |
