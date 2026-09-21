// @kaibuddy/kaiboard-core —— 快照（数据安全），存储走 StorageAdapter.getSetting

import type { StorageAdapter, Snapshot } from "./types.js";

export const SNAPSHOT_KEY = "agentSnapshots";
export const MAX_SNAPSHOTS = 20;

/** 列出快照（可选按画板过滤），最新在前。供「快照还原」UI 使用。 */
export async function listSnapshots(adapter: StorageAdapter, boardId?: string): Promise<Snapshot[]> {
  try {
    const list = await adapter.getSetting<Snapshot[]>(SNAPSHOT_KEY, []);
    const filtered = boardId ? list.filter((s) => s.boardId === boardId) : list;
    return [...filtered].sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

/** 把一份快照的元素压栈（≤MAX_SNAPSHOTS，超出丢弃最旧）。快照失败不阻断主指令。 */
export async function pushSnapshot(
  adapter: StorageAdapter,
  boardId: string | undefined,
  elements: readonly any[],
): Promise<void> {
  if (!boardId) return;
  try {
    const list = await adapter.getSetting<Snapshot[]>(SNAPSHOT_KEY, []);
    list.push({ boardId, ts: Date.now(), elements: JSON.parse(JSON.stringify(elements)) });
    while (list.length > MAX_SNAPSHOTS) list.shift();
    await adapter.setSetting(SNAPSHOT_KEY, list);
  } catch {
    /* 快照失败不应阻断主指令 */
  }
}
