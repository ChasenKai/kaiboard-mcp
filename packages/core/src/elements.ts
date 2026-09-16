// @kaiboard/core —— 元素处理工具（纯函数，无存储依赖）

import type { KbSource } from "./types.js";

/** 生成稳定的元素 id（缺失时自动补，供 agent 后续 patch/delete 引用）。 */
export function genElementId(): string {
  return "kb_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * spec 别名 → Excalidraw 元素属性。
 *
 * 为什么需要这层映射：spec / 生成器层习惯用 `fill` / `stroke` 这类短名
 * （`gen_excalidraw.py` 的 spec 键、Agent 手写的 elements 都是），
 * 而 **Excalidraw 真正渲染读的是 `backgroundColor` / `strokeColor`**。
 * 不做映射时，Agent 传的填充色只会作为一个陌生字段存在元素上，
 * 形状在画布上渲染成**透明无填充**（2026-09-16 由截图实测确认）。
 * 生成器侧早就有这层映射（spec `fill` → element `backgroundColor`），
 * 唯独 MCP 协议链路缺了它——本文件是两端共用的命令内核（页面 relay 与 --dir 服务端），
 * 所以在这里补一次即可同时修复两条链。
 */
const ELEMENT_ALIASES: Record<string, string> = {
  fill: "backgroundColor",
  stroke: "strokeColor",
};

/** 把 spec 别名规范化为 Excalidraw 元素属性；显式元素属性优先。返回新对象（不改原对象）。 */
export function normalizeAliases(el: any): any {
  if (!el || typeof el !== "object") return el;
  const out: any = { ...el };
  for (const from of Object.keys(ELEMENT_ALIASES)) {
    if (out[from] === undefined) continue;
    const to = ELEMENT_ALIASES[from];
    if (out[to] === undefined) out[to] = out[from]; // 已显式给了 backgroundColor/strokeColor 则不动它
    delete out[from]; // 不保留别名，避免元素上出现两个同义字段而彼此漂移
  }
  return out;
}

/** 规范化传入元素：别名映射 + 补稳定 id + C4 源随图走。返回 [元素数组, id 数组]。 */
export function normalizeIncoming(add: any[], source?: KbSource | string): [any[], string[]] {
  const src: KbSource | undefined =
    typeof source === "string" ? { kind: "text", text: source } : source || undefined;
  const ids: string[] = [];
  const norm = add.map((el: any) => {
    if (!el || typeof el !== "object") return el;
    const id = typeof el.id === "string" && el.id ? el.id : genElementId();
    ids.push(id);
    const next: any = { ...normalizeAliases(el), id };
    if (src) {
      next.customData = { ...(el.customData || {}), __kbSource: { ...src, at: Date.now() } };
    }
    return next;
  });
  return [norm, ids];
}

/** #41 防重叠：非空画板时把新元素整体下移到现有内容下方。 */
export function offsetBelow(existing: readonly any[], incoming: any[]): void {
  if (!existing.length || !incoming.length) return;
  const bottom = existing.reduce((m: number, e: any) => {
    const y = typeof e.y === "number" ? e.y : 0;
    const h = typeof e.height === "number" ? e.height : 0;
    return Math.max(m, y + h);
  }, 0);
  const minY = incoming.reduce((m: number, e: any) => {
    const y = typeof e.y === "number" ? e.y : 0;
    return Math.min(m, y);
  }, Infinity);
  const margin = 80;
  const dy = Math.max(0, bottom + margin - minY);
  if (dy > 0) {
    incoming.forEach((e: any) => {
      if (e && typeof e === "object") e.y = (typeof e.y === "number" ? e.y : 0) + dy;
    });
  }
}
