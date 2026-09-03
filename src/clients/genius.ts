// Genius API クライアント — neco の判断カードを引く (AI 実装可否軸の「過去実績」)。
//
// 契約は Genius の src/api/routes/query.ts:
//   POST /api/clone/query { text, domain?, visibility?, categories?, k } -> { cards: ScoredCard[], tookMs }
// 判定に使うのは situation / judgment / rationale / score / confidence のみ。
// 応答は neco 自身の判断なので、 施策評価では「過去に見送った理由」を evidence に貼るのに使う。

import { fetchWithTimeout } from './fetch.ts';

/** 判断カード 1 枚 (Thaleia が使う分)。 */
export interface GeniusCard {
  id: string;
  category: string | null;
  situation: string;
  judgment: string;
  rationale: string;
  tags: string[];
  /** 検索スコア (大きいほど近い)。 */
  score: number;
  /** カード自体の確度 0..1。 */
  confidence: number;
}

export class GeniusUnavailableError extends Error {
  constructor(status: number, detail: string) {
    super(`genius /api/clone/query -> HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'GeniusUnavailableError';
  }
}

export interface GeniusClient {
  /** 施策本文に近い判断カードを引く。 */
  query(input: { text: string; k?: number }): Promise<GeniusCard[]>;
}

export interface GeniusClientOptions {
  baseUrl: string;
}

export function makeGeniusClient(opts: GeniusClientOptions): GeniusClient {
  const base = opts.baseUrl.replace(/\/$/, '');

  return {
    async query(input) {
      const res = await fetchWithTimeout(`${base}/api/clone/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        // domain は work 固定 (施策評価は業務判断)。 visibility は指定せず既定に従う。
        body: JSON.stringify({ text: input.text.slice(0, 100_000), domain: 'work', k: input.k ?? 8 }),
      });
      if (!res.ok) {
        throw new GeniusUnavailableError(res.status, '');
      }
      const data = (await res.json()) as { cards?: Array<Record<string, unknown>> };
      return (data.cards ?? []).map((c) => ({
        id: String(c.id ?? ''),
        category: typeof c.category === 'string' ? c.category : null,
        situation: String(c.situation ?? ''),
        judgment: String(c.judgment ?? ''),
        rationale: String(c.rationale ?? ''),
        tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        score: Number(c.score ?? 0),
        confidence: Number(c.confidence ?? 0),
      }));
    },
  };
}
