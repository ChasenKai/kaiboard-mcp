// @kaiboard/mcp-server —— 协议信封与错误码映射（协议 §1/§2/§8）
import type { AgentCmd } from "@kaiboard/core";

export const KB_PROTOCOL = "1.0.0";
export const SERVER_NAME = "kaiboard-mcp";
export const SERVER_VERSION = "1.0.0"; // 应与本包 package.json 同步

export const COMMANDS: AgentCmd[] = [
  "getBoard",
  "getScreenshot",
  "listBoards",
  "addElement",
  "patchElement",
  "deleteElement",
  "replaceBoard",
  "createBoard",
  "fromMermaid",
  "setMetadata",
];

/** kbProtocol 协商（§2）：当前仅 1.0.0。缺失=默认接受；其它值→不支持。 */
export function negotiate(
  kbProtocol?: string,
): { ok: true } | { ok: false; code: "PROTOCOL_UNSUPPORTED"; message: string } {
  if (!kbProtocol) return { ok: true };
  if (kbProtocol === KB_PROTOCOL) return { ok: true };
  return {
    ok: false,
    code: "PROTOCOL_UNSUPPORTED",
    message: `kbProtocol ${kbProtocol} not supported; server supports ${KB_PROTOCOL}`,
  };
}

/** 把 Core 执行器返回的 error 字符串映射到协议标准错误码（§8）。 */
export function errorCodeFromCore(message: string | undefined): string {
  const m = message || "";
  if (m.includes("screenshot unsupported")) return "EXEC_FAILED";
  if (m.includes("parent folder not found")) return "PARENT_NOT_FOLDER";
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
}) {
  return {
    kbProtocol: KB_PROTOCOL,
    commands: COMMANDS,
    widget: { supported: false, reason: "M2.5 未实现宿主，协议形态已预留" },
    storageModes: ["idb", "fs", "dir", "relay"],
    activeStorageMode: extra?.storageMode ?? "dir",
    snapshot: { max: 20 },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    // M2-3①：Agent 侧配置一致性探测结果（relay /info.folder 与 --dir 比对）
    relayFolder: extra?.relayFolder ?? null,
    dirWarnings: extra?.dirWarnings ?? [],
  };
}
