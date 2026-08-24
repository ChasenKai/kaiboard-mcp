// @kaiboard/core —— 指令执行器（存储无关）
// 把原 agentBridge.ts 的 9 条共绘指令逻辑逐字搬来，所有「存储 / 当前画布 / 截图渲染」
// 都经 StorageAdapter 注入。应用桥（agentBridge）与 MCP 服务端各自实现 StorageAdapter，
// 本文件逻辑完全复用，保证两端行为一致。

import type { StorageAdapter, AgentCommand, KbSource, Snapshot, FileNode, BoardData } from "./types";
import { normalizeIncoming, offsetBelow } from "./elements";
import { pushSnapshot } from "./snapshot";
import { mermaidToElements } from "./mermaid";

export type ExecResult = { ok: boolean; [k: string]: any };

/** 内部复用：把一批元素追加到目标画板（target 缺省 = 当前画板）。 */
async function appendElements(
  adapter: StorageAdapter,
  target: string | undefined,
  raw: any[],
  source: KbSource | string | undefined,
  onActivity: (msg: string) => void,
): Promise<{ ok: true; added: number; ids: string[] }> {
  const cur = await adapter.readElements(target);
  const [norm, ids] = normalizeIncoming(raw, source);
  offsetBelow(cur, norm);
  await adapter.writeElements(target, [...cur, ...norm]);
  if (norm.length) {
    onActivity(
      target
        ? `Agent 共绘：已向其它画板添加 ${norm.length} 个元素`
        : `Agent 共绘：已添加 ${norm.length} 个元素`,
    );
  }
  return { ok: true, added: norm.length, ids };
}

/**
 * 执行单条共绘指令；可被 postMessage 监听与本地中继轮询、以及 MCP 服务端共用。
 * 令牌校验由传输层（postMessage 监听 / MCP 服务端）在调用前完成，本函数不再校验。
 */
export async function executeCommand(
  adapter: StorageAdapter,
  onActivity: (msg: string) => void,
  d: AgentCommand,
): Promise<ExecResult> {
  if (!d || typeof d.cmd !== "string") return { ok: false, error: "bad command" };

  const target = d.boardId;

  try {
    switch (d.cmd) {
      // ---------- 读 ----------
      case "getBoard": {
        const els = await adapter.readElements(target);
        return { ok: true, boardId: target || adapter.currentBoardId || null, elements: els };
      }

      /** P0.5 视觉读：把目标画板渲成 PNG（base64 data URL）交回 Agent 自查。 */
      case "getScreenshot": {
        const meta = await adapter.readMeta(target);
        if (!meta.elements.length) {
          return { ok: true, empty: true, dataUrl: null, boardId: target || adapter.currentBoardId || null };
        }
        if (!adapter.renderPng) {
          return {
            ok: false,
            error: "screenshot unsupported in this runtime",
            boardId: target || adapter.currentBoardId || null,
          };
        }
        const o = d.opts || {};
        const { dataUrl, bytes } = await adapter.renderPng(meta.elements, meta.files, meta.appState, o);
        return {
          ok: true,
          boardId: target || adapter.currentBoardId || null,
          mimeType: "image/png",
          bytes,
          dataUrl,
        };
      }

      /** N2：返回文件树（文件夹 + 画板），供 Agent 寻址。 */
      case "listBoards": {
        const nodes: FileNode[] = await adapter.listBoards();
        const slim = nodes.map((n) => ({
          id: n.id,
          type: n.type,
          name: n.name,
          parentId: n.parentId,
          updatedAt: n.updatedAt,
        }));
        return { ok: true, activeBoardId: adapter.currentBoardId || null, nodes: slim };
      }

      // ---------- 写 ----------
      case "addElement": {
        const add = Array.isArray(d.elements) ? d.elements : d.elements ? [d.elements] : [];
        if (!add.length) return { ok: true, added: 0, ids: [] };
        return await appendElements(adapter, target, add, d.source, onActivity);
      }

      /** N1：按 id 局部合并属性（不存在的 id 记入 missing）。 */
      case "patchElement": {
        const raw = Array.isArray(d.patches) ? d.patches : d.patches ? [d.patches] : [];
        if (!raw.length) return { ok: true, patched: 0, missing: [] };
        const cur = await adapter.readElements(target);
        const byId = new Map<string, any>();
        for (const p of raw) if (p && typeof p === "object" && typeof p.id === "string") byId.set(p.id, p);
        const missing: string[] = [];
        for (const id of byId.keys()) if (!cur.some((e: any) => e && e.id === id)) missing.push(id);
        let patched = 0;
        const next = cur.map((e: any) => {
          if (!e || typeof e !== "object") return e;
          const p = byId.get(e.id);
          if (!p) return e;
          patched++;
          const merged: any = { ...e, ...p, id: e.id, versionNonce: Math.floor(Math.random() * 2 ** 31) };
          if (p.customData || e.customData) {
            merged.customData = { ...(e.customData || {}), ...(p.customData || {}) };
          }
          return merged;
        });
        if (patched) {
          await adapter.writeElements(target, next);
          onActivity(`Agent 共绘：已修改 ${patched} 个元素`);
        }
        return { ok: true, patched, missing };
      }

      /** N4：按 id 删除元素。 */
      case "deleteElement": {
        const ids = Array.isArray(d.ids) ? d.ids : d.ids ? [d.ids] : [];
        if (!ids.length) return { ok: true, deleted: 0, missing: [] };
        const cur = await adapter.readElements(target);
        const set = new Set(ids);
        const missing = ids.filter((id) => !cur.some((e: any) => e && e.id === id));
        const next = cur.filter((e: any) => !(e && set.has(e.id)));
        const deleted = cur.length - next.length;
        if (deleted) {
          await adapter.writeElements(target, next);
          onActivity(`Agent 共绘：已删除 ${deleted} 个元素`);
        }
        return { ok: true, deleted, missing };
      }

      case "replaceBoard": {
        const raw = Array.isArray(d.elements) ? d.elements : [];
        const before = await adapter.readElements(target);
        await pushSnapshot(adapter, target || adapter.currentBoardId, before);
        const [els] = normalizeIncoming(raw, d.source);
        await adapter.writeElements(target, els);
        onActivity(`Agent 共绘：已整板替换（${els.length} 个元素）`);
        return { ok: true, replaced: els.length };
      }

      /** A1：新建空画板（直写存储，不切画布），返回 boardId。 */
      case "createBoard": {
        const now = Date.now();
        const id = crypto.randomUUID();
        const parentId = d.parentId ?? null;
        if (parentId) {
          const p = await adapter.getNode(parentId);
          if (!p || p.type !== "folder") return { ok: false, error: "parent folder not found: " + parentId };
        }
        const order = (await adapter.getMaxOrder(parentId)) + 1;
        const node: FileNode = {
          id,
          type: "board",
          name: (d.name || "").trim() || "Agent 画板",
          parentId,
          createdAt: now,
          updatedAt: now,
          order,
        };
        await adapter.putNode(node);
        const init = Array.isArray(d.elements) ? d.elements : [];
        const [els] = normalizeIncoming(init, d.source);
        const data: BoardData = { id, elements: els, appState: {}, files: {} };
        await adapter.putBoardData(id, data);
        onActivity(`Agent 共绘：已新建画板「${node.name}」`);
        return { ok: true, boardId: id, name: node.name, added: els.length };
      }

      /** C5 / P1：Mermaid → 原生可编辑 Excalidraw 图元。 */
      case "fromMermaid": {
        const src = (d.mermaid || "").trim();
        if (!src) return { ok: false, error: "empty mermaid" };
        let converted: any[];
        try {
          converted = await mermaidToElements(src, d.opts?.fontSize || 16);
        } catch (e: any) {
          return { ok: false, error: "mermaid parse failed: " + (e?.message || String(e)) };
        }
        // C4：mermaid 源码天然就是「源随图走」的最佳载体
        const source: KbSource = { kind: "mermaid", text: src, ...(typeof d.source === "object" ? d.source : {}) };
        if (d.opts?.replace) {
          const before = await adapter.readElements(target);
          await pushSnapshot(adapter, target || adapter.currentBoardId, before);
          const [els] = normalizeIncoming(converted, source);
          await adapter.writeElements(target, els);
          onActivity(`Agent 共绘：Mermaid 已整板落图（${els.length} 个元素）`);
          return { ok: true, replaced: els.length };
        }
        const r = await appendElements(adapter, target, converted, source, onActivity);
        return { ...r, fromMermaid: true };
      }

      default:
        return { ok: false, error: "unknown cmd" };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
