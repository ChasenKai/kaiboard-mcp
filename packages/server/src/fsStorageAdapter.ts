// @kaiboard/mcp-server —— --dir 存储适配器（复用 @kaiboard/core 的 StorageAdapter）
// 文件布局与 app 的 fsStore.ts **完全一致**（落板即见）：
//   <root>/kaiboard-data/tree.json         文件树节点 FileNode[]
//   <root>/kaiboard-data/boards/<id>.json   每个画板内容 BoardData
//   <root>/kaiboard-data/settings.json      设置（含 agentSnapshots 快照栈）
// 用 node:fs 实现（app 用浏览器 File System Access API；两者写同一布局 → 互读互见）。

import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import type { StorageAdapter, FileNode, BoardData } from "@kaiboard/core";

const DATA_SUB = "kaiboard-data";

export function createFsStorageAdapter(rootDir: string): StorageAdapter {
  const dataDir = join(rootDir, DATA_SUB);
  const treePath = join(dataDir, "tree.json");
  const boardsDir = join(dataDir, "boards");
  const settingsPath = join(dataDir, "settings.json");

  async function ensureDirs(): Promise<void> {
    await fs.mkdir(boardsDir, { recursive: true });
  }
  async function readJson<T>(p: string, fallback: T): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const t = await fs.readFile(p, "utf8");
        return JSON.parse(t) as T;
      } catch (e: any) {
        // 文件确实不存在 → 直接返回 fallback（首建文件夹场景）
        if (e?.code === "ENOENT") return fallback;
        // 否则可能是并发写导致的半截读取：短暂等待后重试，避免兜底成 [] 把整棵 tree 清空
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 30));
          continue;
        }
        return fallback;
      }
    }
    return fallback;
  }
  async function writeJson(p: string, data: unknown): Promise<void> {
    await fs.mkdir(dirname(p), { recursive: true });
    const tmp = p + ".tmp";
    // 同文件系统内 rename 是原子操作：读者不会看到半截文件，从根本上杜绝并发读到的 [] 兜底
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, p);
  }
  async function readTree(): Promise<FileNode[]> {
    return readJson<FileNode[]>(treePath, []);
  }
  async function writeTree(nodes: FileNode[]): Promise<void> {
    await writeJson(treePath, nodes);
  }
  async function readBoard(id: string): Promise<BoardData | undefined> {
    return readJson<BoardData | undefined>(join(boardsDir, id + ".json"), undefined);
  }
  async function writeBoard(b: BoardData): Promise<void> {
    await writeJson(join(boardsDir, b.id + ".json"), b);
  }
  async function aliveNodes(): Promise<FileNode[]> {
    const all = await readTree();
    return all.filter((n) => !n.deletedAt);
  }
  function firstBoardId(nodes: FileNode[]): string | undefined {
    const b = nodes.find((n) => n.type === "board");
    return b?.id;
  }

  const adapter: StorageAdapter = {
    // --dir 无实时画布：默认无「当前画板」，命令应显式 boardId（见协议 §5 寻址）
    currentBoardId: undefined,

    async readElements(target) {
      const id = target ?? firstBoardId(await aliveNodes());
      if (!id) return [];
      const b = await readBoard(id);
      return b?.elements ?? [];
    },

    async readMeta(target) {
      const id = target ?? firstBoardId(await aliveNodes());
      const b = id ? await readBoard(id) : undefined;
      return { elements: b?.elements ?? [], files: b?.files ?? {}, appState: b?.appState ?? {} };
    },

    async writeElements(target, elements) {
      await ensureDirs();
      const id = target ?? firstBoardId(await aliveNodes());
      if (!id) throw new Error("writeElements: no target board id (pass boardId)");
      const existing = (await readBoard(id)) ?? { id, elements: [], appState: {}, files: {} };
      const next: BoardData = { ...existing, id, elements };
      await writeBoard(next);
      // 落板即见：保证 tree.json 有该节点
      const tree = await readTree();
      const node = tree.find((n) => n.id === id);
      if (!node) {
        tree.push({
          id,
          type: "board",
          name: (existing.appState?.name as string) || "Agent 画板",
          parentId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else {
        node.updatedAt = Date.now();
      }
      await writeTree(tree);
    },

    async listBoards() {
      return aliveNodes();
    },

    async getNode(id) {
      return (await readTree()).find((n) => n.id === id);
    },

    async putNode(node) {
      const tree = await readTree();
      const i = tree.findIndex((n) => n.id === node.id);
      if (i >= 0) tree[i] = node;
      else tree.push(node);
      await writeTree(tree);
    },

    async putBoardData(id, data) {
      await ensureDirs();
      await writeBoard(data);
      const tree = await readTree();
      let node = tree.find((n) => n.id === id);
      if (!node) {
        node = {
          id,
          type: "board",
          name: (data.appState?.name as string) || "Agent 画板",
          parentId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        tree.push(node);
      } else {
        node.updatedAt = Date.now();
      }
      await writeTree(tree);
    },

    async getMaxOrder(parentId) {
      const kids = (await aliveNodes()).filter((n) => n.parentId === parentId);
      return kids.length ? Math.max(...kids.map((k) => k.order ?? 0)) : 0;
    },

    async getSetting<T>(key: string, fallback: T): Promise<T> {
      const s = await readJson<Record<string, unknown>>(settingsPath, {});
      return key in s ? (s[key] as T) : fallback;
    },

    async setSetting(key, value) {
      const s = await readJson<Record<string, unknown>>(settingsPath, {});
      s[key] = value;
      await writeJson(settingsPath, s);
    },

    // renderPng 不注入（--dir headless 无 canvas）→ getScreenshot 返回 unsupported（R1）

    // M2-2 画板级元数据：直接读写 tree.json 中 FileNode 的元数据字段
    async getMetadata(boardId) {
      const node = (await readTree()).find((n) => n.id === boardId && !n.deletedAt);
      if (!node) return null;
      return {
        status: node.status,
        version: node.version,
        history: node.history,
        comments: node.comments,
      };
    },

    async setMetadata(boardId, partial) {
      const tree = await readTree();
      const node = tree.find((n) => n.id === boardId && !n.deletedAt);
      if (!node) return false;
      if (typeof partial.status === "string") node.status = partial.status;
      if (typeof partial.version === "number") node.version = partial.version;
      if (Array.isArray(partial.history)) node.history = partial.history;
      if (Array.isArray(partial.comments)) node.comments = partial.comments;
      node.updatedAt = Date.now();
      await writeTree(tree);
      return true;
    },
  };

  return adapter;
}
