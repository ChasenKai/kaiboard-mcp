// @kaiboard/core —— 元素处理工具（纯函数，无存储依赖）

import type { KbSource } from "./types.js";

/** 生成稳定的元素 id（缺失时自动补，供 agent 后续 patch/delete 引用）。 */
export function genElementId(): string {
  return "kb_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 规范化传入元素：补稳定 id + C4 源随图走。返回 [元素数组, id 数组]。 */
export function normalizeIncoming(add: any[], source?: KbSource | string): [any[], string[]] {
  const src: KbSource | undefined =
    typeof source === "string" ? { kind: "text", text: source } : source || undefined;
  const ids: string[] = [];
  const norm = add.map((el: any) => {
    if (!el || typeof el !== "object") return el;
    const id = typeof el.id === "string" && el.id ? el.id : genElementId();
    ids.push(id);
    const next: any = { ...el, id };
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
