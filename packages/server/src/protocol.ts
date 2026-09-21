// @kaibuddy/kaiboard-mcp —— 协议信封与错误码映射（协议 §1/§2/§8）
import type { AgentCmd } from "@kaibuddy/kaiboard-core";

// kbProtocol 是**独立于包版本**的协议轴：只在接口发生不兼容变更时才提升主版本号。
// 包版本可以一路涨（0.2.0 → 0.9.0），kbProtocol 保持 "1.0" 不变，老客户端不受影响。
export const KB_PROTOCOL = "1.0";
export const SERVER_NAME = "kaiboard-mcp";
export const SERVER_VERSION = "0.4.1"; // 应与本包 package.json 同步

export const COMMANDS: AgentCmd[] = [
  "getBoard",
  "getScreenshot",
  "listBoards",
  "addElement",
  "patchElement",
  "deleteElement",
  "replaceBoard",
  "createBoard",
  "createFolder",
  "renameBoard",
  "renameFolder",
  "deleteBoard",
  "deleteFolder",
  "listTrash",
  "restoreNode",
  "moveNode",
  "reorderNode",
  "fromMermaid",
  "setMetadata",
];

/**
 * kbProtocol 协商（§2）——**主版本号一致即兼容**。
 *
 * - 缺失 → 接受（服务端按当前默认处理，便于宽松接入）
 * - 主版本一致（如客户端 "1.0" / "1.3"，服务端 "1.0"）→ 接受
 * - 主版本不同（如 "2.0"、"0.1.1"）→ PROTOCOL_UNSUPPORTED
 *
 * 这样包版本在小版本/patch 上迭代时不会打断既有客户端 —— 只有真正的
 * 不兼容变更（删改/重命名命令、改变参数含义、把可选字段改为必填、改默认行为）
 * 才提升 kbProtocol 主版本号。协议文档见仓库 docs/PROTOCOL.md §2。
 */
export function kbProtocolMajor(v: string): string {
  return String(v).trim().split(".")[0] || "";
}

export function negotiate(
  kbProtocol?: string,
): { ok: true } | { ok: false; code: "PROTOCOL_UNSUPPORTED"; message: string } {
  if (!kbProtocol) return { ok: true };
  const clientMajor = kbProtocolMajor(kbProtocol);
  const serverMajor = kbProtocolMajor(KB_PROTOCOL);
  if (clientMajor && clientMajor === serverMajor) return { ok: true };
  return {
    ok: false,
    code: "PROTOCOL_UNSUPPORTED",
    message: `kbProtocol ${kbProtocol} not supported; server supports ${KB_PROTOCOL} (compatible major: ${serverMajor}.x)`,
  };
}

/** 把 Core 执行器返回的 error 字符串映射到协议标准错误码（§8）。 */
export function errorCodeFromCore(message: string | undefined): string {
  const m = message || "";
  if (m.includes("screenshot unsupported")) return "EXEC_FAILED";
  if (m.includes("parent folder not found")) return "PARENT_NOT_FOLDER";
  if (m.includes("board not found") || m.includes("folder not found")) return "BOARD_NOT_FOUND";
  if (m.includes("not a folder") || m.includes("not a board")) return "BAD_TYPE";
  if (m.includes("requires name") || m.includes("requires folderId") || m.includes("requires boardId")
      || m.includes("requires nodeId") || m.includes("requires a numeric order")) return "BAD_TYPE";
  if (m.includes("cannot move a node into")) return "BAD_TYPE";
  if (m.includes("unknown cmd")) return "UNKNOWN_CMD";
  if (m.includes("empty mermaid") || m.includes("mermaid parse failed")) return "MERMAID_PARSE_FAILED";
  if (m.includes("bad command")) return "BAD_TYPE";
  return "EXEC_FAILED";
}

export function envelope(kbProtocol: string, requestId: string, result: any) {
  return { kbProtocol, requestId, ok: true, result };
}

export function errorEnvelope(kbProtocol: string, requestId: string, code: string, message: string) {
  return { kbProtocol, requestId, ok: false, error: { code, message } };
}

export function listCapabilitiesResult(extra?: {
  relayFolder?: string | null;
  dirWarnings?: string[];
  storageMode?: "dir" | "relay";
  relayAvailable?: boolean;
  dirAvailable?: boolean;
  /** KaiBoard 页面是否已连接到中继（= 用户是否正开着画板）。 */
  pageConnected?: boolean;
}) {
  return {
    kbProtocol: KB_PROTOCOL,
    commands: COMMANDS,
    storageModes: ["idb", "fs", "dir", "relay"],
    activeStorageMode: extra?.storageMode ?? "dir",
    snapshot: { max: 20 },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    // Agent 侧配置一致性探测结果（relay /info.folder 与 --dir 比对）
    relayFolder: extra?.relayFolder ?? null,
    dirWarnings: extra?.dirWarnings ?? [],
    // 声明当前已启用的后端能力，供 Agent 侧按 storage 路由决策
    relayAvailable: extra?.relayAvailable ?? false,
    dirAvailable: extra?.dirAvailable ?? false,
    // relayAvailable 只代表中继进程在跑；pageConnected 才代表用户真的开着画板。
    // Agent 侧降级规则应优先看这个字段。
    pageConnected: extra?.pageConnected ?? false,
  };
}
