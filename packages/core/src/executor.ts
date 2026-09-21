// @kaibuddy/kaiboard-core —— 指令执行器（存储无关）
// 把原 agentBridge.ts 的 9 条共绘指令逻辑逐字搬来，所有「存储 / 当前画布 / 截图渲染」
// 都经 StorageAdapter 注入。应用桥（agentBridge）与 MCP 服务端各自实现 StorageAdapter，
// 本文件逻辑完全复用，保证两端行为一致。

import type { StorageAdapter, AgentCommand, KbSource, Snapshot, FileNode, BoardData } from "./types.js";
import { normalizeIncoming, normalizeAliases, offsetBelow } from "./elements.js";
import { pushSnapshot } from "./snapshot.js";
import { mermaidToElements } from "./mermaid.js";

export type ExecResult = { ok: boolean; [k: string]: any };

/** 内部复用：把一批元素追加到目标画板（target 缺省 = 当前画板）。 */
async function appendElements(
  adapter: StorageAdapter,
  target: string | undefined,
  raw: any[],
  source: KbSource | string | undefined,
  onActivity: (msg: string) => void,
  noOffset?: boolean,
): Promise<{ ok: true; added: number; ids: string[] }> {
  const cur = await adapter.readElements(target);
  const [norm, ids] = normalizeIncoming(raw, source);
  if (!noOffset) offsetBelow(cur, norm);
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

      /** 视觉读：把目标画板渲成 PNG（base64 data URL）交回 Agent 自查。 */
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

      /** 返回文件树（文件夹 + 画板），供 Agent 寻址。 */
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
        return await appendElements(adapter, target, add, d.source, onActivity, d.opts?.noOffset);
      }

      /** 按 id 局部合并属性（不存在的 id 记入 missing）。 */
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
          // 与 addElement 走同一条别名映射：patch 里写 `fill` / `stroke` 也要落到
          // Excalidraw 的 backgroundColor / strokeColor，否则改色只写进陌生字段、画布上颜色不变。
          const merged: any = {
            ...e,
            ...normalizeAliases(p),
            id: e.id,
            versionNonce: Math.floor(Math.random() * 2 ** 31),
          };
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

      /** 按 id 删除元素。 */
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

      /** 新建空画板（直写存储，不切画布），返回 boardId。 */
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

      /**
       * createFolder：新建文件夹（name 必填；parentId 缺省 = 根层）。
       * 与 createBoard 同构，差别只在 node.type = "folder" 且不写画板数据。
       */
      case "createFolder": {
        const nm = (d.name || "").trim();
        if (!nm) return { ok: false, error: "createFolder requires name" };
        const parentId = d.parentId ?? null;
        if (parentId) {
          const p = await adapter.getNode(parentId);
          if (!p || p.type !== "folder") return { ok: false, error: "parent folder not found: " + parentId };
        }
        const id = crypto.randomUUID();
        const now = Date.now();
        const order = (await adapter.getMaxOrder(parentId)) + 1;
        const node: FileNode = { id, type: "folder", name: nm, parentId, createdAt: now, updatedAt: now, order };
        await adapter.putNode(node);
        onActivity(`Agent 共绘：已新建文件夹「${nm}」`);
        return { ok: true, folderId: id, name: nm, parentId };
      }

      /**
       * renameBoard：改画板名（须显式给 boardId）。
       * 只改 name / updatedAt —— 不动 parentId、order、内容与回收站状态。
       */
      case "renameBoard": {
        const id = d.boardId;
        const nm = (d.name || "").trim();
        if (!id) return { ok: false, error: "renameBoard requires boardId" };
        if (!nm) return { ok: false, error: "renameBoard requires name" };
        const node = await adapter.getNode(id);
        if (!node) return { ok: false, error: "board not found: " + id };
        if (node.type !== "board") return { ok: false, error: "not a board (use renameFolder): " + id };
        const previousName = node.name;
        node.name = nm;
        node.updatedAt = Date.now();
        await adapter.putNode(node);
        onActivity(`Agent 共绘：画板「${previousName}」已更名为「${nm}」`);
        return { ok: true, boardId: id, name: nm, previousName };
      }

      /**
       * renameFolder：改文件夹名（须显式给 folderId）。
       */
      case "renameFolder": {
        const id = d.folderId;
        const nm = (d.name || "").trim();
        if (!id) return { ok: false, error: "renameFolder requires folderId" };
        if (!nm) return { ok: false, error: "renameFolder requires name" };
        const node = await adapter.getNode(id);
        if (!node) return { ok: false, error: "folder not found: " + id };
        if (node.type !== "folder") return { ok: false, error: "not a folder (use renameBoard): " + id };
        const previousName = node.name;
        node.name = nm;
        node.updatedAt = Date.now();
        await adapter.putNode(node);
        onActivity(`Agent 共绘：文件夹「${previousName}」已更名为「${nm}」`);
        return { ok: true, folderId: id, name: nm, previousName };
      }

      /**
       * deleteBoard：软删除画板（进回收站，用户可在 UI 回收站还原）。
       * 安全约束：① 必须显式给 boardId；② 只删 board 类型，文件夹请用 UI；
       * ③ 拒绝删除当前正打开的画板（避免画布仍显示已删内容的状态不一致）。
       */
      case "deleteBoard": {
        const id = d.boardId;
        if (!id) return { ok: false, error: "deleteBoard requires boardId" };
        const node = await adapter.getNode(id);
        if (!node) return { ok: false, error: "board not found: " + id };
        if (node.type !== "board") return { ok: false, error: "not a board (use UI to delete folders): " + id };
        if (adapter.currentBoardId && id === adapter.currentBoardId) {
          return { ok: false, error: "cannot delete the currently open board; switch to another board first" };
        }
        if (typeof adapter.trashNode === "function") {
          await adapter.trashNode(id);
          onActivity(`Agent 共绘：已删除画板「${node.name}」（可在回收站还原）`);
          return { ok: true, deleted: 1, boardId: id, name: node.name, trashed: true };
        }
        return { ok: false, error: "unsupported: current storage backend cannot delete boards" };
      }

      /**
       * deleteFolder：软删除文件夹及其全部子孙（进回收站，可还原）。
       * 安全约束：① 必须显式给 folderId；② 只删 folder 类型；
       * ③ 拒绝删除「当前打开的画板所在」的文件夹（否则画布会指向已删内容）。
       */
      case "deleteFolder": {
        const id = d.folderId;
        if (!id) return { ok: false, error: "deleteFolder requires folderId" };
        const node = await adapter.getNode(id);
        if (!node) return { ok: false, error: "folder not found: " + id };
        if (node.type !== "folder") return { ok: false, error: "not a folder (use deleteBoard): " + id };
        if (adapter.currentBoardId) {
          const all = await adapter.listBoards();
          const parentOf = new Map(all.map((n) => [n.id, n.parentId] as const));
          let cur: string | null | undefined = adapter.currentBoardId;
          const guard = new Set<string>();
          while (cur && !guard.has(cur)) {
            guard.add(cur);
            if (cur === id) {
              return { ok: false, error: "cannot delete a folder that contains the currently open board; switch to another board first" };
            }
            cur = parentOf.get(cur) ?? null;
          }
        }
        if (typeof adapter.trashNode === "function") {
          await adapter.trashNode(id);
          onActivity(`Agent 共绘：已删除文件夹「${node.name}」及其内容（可在回收站还原）`);
          return { ok: true, deleted: 1, folderId: id, name: node.name, trashed: true };
        }
        return { ok: false, error: "unsupported: current storage backend cannot delete folders" };
      }

      /** listTrash：回收站顶层条目（子孙不重复列，与 UI 回收站一致）。 */
      case "listTrash": {
        if (typeof adapter.listTrash === "function") {
          const nodes = await adapter.listTrash();
          return {
            ok: true,
            count: nodes.length,
            items: nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, deletedAt: n.deletedAt ?? null })),
          };
        }
        return { ok: false, error: "unsupported: current storage backend cannot list trash" };
      }

      /**
       * restoreNode：从回收站还原（连同其子孙一起还原）。
       * 注：若原父级已删或不存在，实现侧会把 parentId 置空（落到根层），不会还原失败。
       */
      case "restoreNode": {
        const id = d.nodeId || d.boardId || d.folderId;
        if (!id) return { ok: false, error: "restoreNode requires nodeId" };
        if (typeof adapter.restoreNode === "function") {
          // 先校验：节点必须存在、且确实在回收站里。
          // 底层 restoreNode 对未知 id 是「静默返回」，若不校验会误报成功（E2E 实测过）。
          const node = await adapter.getNode(id);
          if (!node) return { ok: false, error: "node not found: " + id };
          if (!node.deletedAt) return { ok: false, error: "node is not in trash: " + id };
          await adapter.restoreNode(id);
          onActivity(`Agent 共绘：已从回收站还原「${node.name}」`);
          return { ok: true, restored: 1, nodeId: id, name: node.name };
        }
        return { ok: false, error: "unsupported: current storage backend cannot restore from trash" };
      }

      /**
       * moveNode：把节点移到另一个父级（null / 省略 = 根层）。画板与文件夹都适用。
       * 两道防环：不许移进自己；不许移进自己的子孙。
       */
      case "moveNode": {
        const id = d.nodeId;
        if (!id) return { ok: false, error: "moveNode requires nodeId" };
        const node = await adapter.getNode(id);
        if (!node) return { ok: false, error: "node not found: " + id };
        const newParent = d.parentId ?? null;
        if (newParent) {
          if (newParent === id) return { ok: false, error: "cannot move a node into itself" };
          const p = await adapter.getNode(newParent);
          if (!p || p.type !== "folder") return { ok: false, error: "parent folder not found: " + newParent };
          const all = await adapter.listBoards();
          const parentOf = new Map(all.map((n) => [n.id, n.parentId] as const));
          let cur: string | null | undefined = newParent;
          const guard = new Set<string>();
          while (cur && !guard.has(cur)) {
            guard.add(cur);
            if (cur === id) return { ok: false, error: "cannot move a node into its own descendant" };
            cur = parentOf.get(cur) ?? null;
          }
        }
        const previousParentId = node.parentId;
        const order = (await adapter.getMaxOrder(newParent)) + 1;
        node.parentId = newParent;
        node.order = order;
        node.updatedAt = Date.now();
        await adapter.putNode(node);
        onActivity(`Agent 共绘：「${node.name}」已移动`);
        return { ok: true, nodeId: id, name: node.name, parentId: newParent, previousParentId, order };
      }

      /** reorderNode：调整同层排序（order 越小越靠前）。 */
      case "reorderNode": {
        const id = d.nodeId;
        if (!id) return { ok: false, error: "reorderNode requires nodeId" };
        if (typeof d.order !== "number" || !Number.isFinite(d.order)) {
          return { ok: false, error: "reorderNode requires a numeric order" };
        }
        const node = await adapter.getNode(id);
        if (!node) return { ok: false, error: "node not found: " + id };
        const previousOrder = node.order ?? null;
        node.order = d.order;
        node.updatedAt = Date.now();
        await adapter.putNode(node);
        onActivity(`Agent 共绘：「${node.name}」顺序已调整`);
        return { ok: true, nodeId: id, name: node.name, order: node.order, previousOrder };
      }

      /** Mermaid → 原生可编辑 Excalidraw 图元。 */
      case "fromMermaid": {
        const src = (d.mermaid || "").trim();
        if (!src) return { ok: false, error: "empty mermaid" };
        let converted: any[];
        try {
          converted = await mermaidToElements(src, d.opts?.fontSize || 16);
        } catch (e: any) {
          const msg = e?.message || String(e);
          // --dir 模式若未显式安装 @excalidraw/mermaid-to-excalidraw（peer optional），
          // 动态 import 会抛 ERR_MODULE_NOT_FOUND。给出可被 Agent 直接读懂的行动提示。
          if (/Cannot find (module|package)|ERR_MODULE_NOT_FOUND/i.test(msg)) {
            return {
              ok: false,
              error:
                "mermaid-to-excalidraw 依赖未安装：--dir 模式需显式安装 @excalidraw/mermaid-to-excalidraw（及其 mermaid 依赖）才能用此命令；或改用 kaiboard-mcp --relay 驱动运行中的 KaiBoard app 以使用 fromMermaid",
            };
          }
          return { ok: false, error: "mermaid parse failed: " + msg };
        }
        // mermaid 源码天然就是「源随图走」的最佳载体
        const source: KbSource = { kind: "mermaid", text: src, ...(typeof d.source === "object" ? d.source : {}) };
        if (d.opts?.replace) {
          const before = await adapter.readElements(target);
          await pushSnapshot(adapter, target || adapter.currentBoardId, before);
          const [els] = normalizeIncoming(converted, source);
          await adapter.writeElements(target, els);
          onActivity(`Agent 共绘：Mermaid 已整板落图（${els.length} 个元素）`);
          return { ok: true, replaced: els.length };
        }
        const r = await appendElements(adapter, target, converted, source, onActivity, d.opts?.noOffset);
        return { ...r, fromMermaid: true };
      }

      /** ：设置画板级元数据（status/version/history/comments）。仅 --dir fs 模式支持。 */
      case "setMetadata": {
        const id = target || adapter.currentBoardId;
        if (!id) return { ok: false, error: "setMetadata requires boardId (no current board in this runtime)" };
        if (!adapter.setMetadata) return { ok: false, error: "metadata unsupported in this runtime" };
        const partial = d.metadata || {};
        const ok = await adapter.setMetadata(id, partial);
        if (!ok) return { ok: false, error: "board node not found: " + id };
        onActivity(`Agent 共绘：已更新画板元数据「${id}」`);
        return { ok: true, boardId: id };
      }

      default:
        return { ok: false, error: "unknown cmd" };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
