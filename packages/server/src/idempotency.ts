// @kaiboard/mcp-server —— requestId 幂等缓存（协议 §3）
// 缓存近期 requestId → 响应；命中且未过期直接回放，不重执行写操作（避免网络超时重试双写）。

interface Entry {
  response: any;
  ts: number;
}

export class IdempotencyCache {
  private map = new Map<string, Entry>();
  private ttlMs: number;
  private max: number;

  constructor(ttlMs = 5 * 60 * 1000, max = 100) {
    this.ttlMs = ttlMs;
    this.max = max;
  }

  /** 命中且未过期 → 回放缓存（worker 不调用）；否则执行 worker 并缓存响应。 */
  async run(requestId: string, worker: () => Promise<any>): Promise<any> {
    const now = Date.now();
    const hit = this.map.get(requestId);
    if (hit && now - hit.ts < this.ttlMs) return hit.response; // 回放，不重执行
    const response = await worker();
    this.map.set(requestId, { response, ts: now });
    if (this.map.size > this.max) {
      let oldestKey: string | null = null;
      let oldestTs = Infinity;
      for (const [k, e] of this.map) {
        if (e.ts < oldestTs) {
          oldestTs = e.ts;
          oldestKey = k;
        }
      }
      if (oldestKey) this.map.delete(oldestKey);
    }
    return response;
  }

  seen(requestId: string): boolean {
    const hit = this.map.get(requestId);
    return !!hit && Date.now() - hit.ts < this.ttlMs;
  }
}
