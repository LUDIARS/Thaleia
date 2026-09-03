// Discutere API クライアント — ペルソナ議論の集計と施策の議論起票。
//
// 契約は Discutere の spec/interface/consensus-admin.md (2026-09-03 追加):
//   GET  /api/admin/consensus/:gapId/personas -> { gapId, personas: [...] }
//   POST /api/admin/gaps                      -> { gapId, sessionId } (201)
// admin REST は X-User-Id / X-User-Role ヘッダーを見る薄い認可で、 loopback からは admin 扱い。
// 明示 user id を持つ運用 (LAN 越し) 用に header を付けられるようにしてある。
//
// 既存パターン集合 (凡庸性ルール) は GET /learning/data?layer=games から読む。
// mechanics / aesthetics テーブルの読み取り API はこれしか無い (2026-09-03 実装で確認)。

import { fetchWithTimeout } from './fetch.ts';

/** ペルソナ 1 人ぶんの議論集計 (Di の PersonaConsensusSummary と同形)。 */
export interface DiscuterePersonaConsensus {
  personaId: string;
  displayName: string;
  traits: string[];
  utterances: Array<{
    id: string;
    content: string;
    postedAt: number;
    agree: boolean | null;
    score: number | null;
    reasoning: string | null;
  }>;
  /** そのペルソナの発話に付いた opinion_scores の合計。 */
  opinionScore: number;
  /** consensus_scores の合計。 */
  consensusScore: number;
  /** 採点済み発話に対する同意率 0..1。 */
  agreeRatio: number;
}

/** ゲーム 1 件の既存パターン (mechanics / aesthetics)。 */
export interface DiscutereGamePatterns {
  gameId: string;
  title: string;
  mechanics: Array<{ name: string; description: string | null }>;
  aesthetics: Array<{ name: string; description: string | null }>;
}

/** Discutere 呼び出しが「使えなかった」ことを表す (missing に積む)。 */
export class DiscutereUnavailableError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    detail: string,
  ) {
    super(`discutere ${endpoint} -> HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'DiscutereUnavailableError';
  }
}

export interface DiscutereClient {
  /** 議論のペルソナ別集計。 該当 session が無ければ空配列 (Di 側仕様)。 */
  getPersonaConsensus(gapId: string): Promise<DiscuterePersonaConsensus[]>;
  /** 施策から design_gap を起票し、 discussion セッションを開始する。 */
  createGap(input: { title: string; description: string; gameId?: string | null }): Promise<{
    gapId: string;
    sessionId: string;
  }>;
  /** 既存パターン集合 (凡庸性判定の参照先)。 */
  listGamePatterns(opts?: { limit?: number; detailLimit?: number }): Promise<DiscutereGamePatterns[]>;
}

export interface DiscutereClientOptions {
  baseUrl: string;
  /** admin REST 用の X-User-Id。 null なら送らない (loopback admin に委ねる)。 */
  userId: string | null;
}

export function makeDiscutereClient(opts: DiscutereClientOptions): DiscutereClient {
  const base = opts.baseUrl.replace(/\/$/, '');

  function headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { accept: 'application/json', ...extra };
    if (opts.userId) {
      h['x-user-id'] = opts.userId;
      h['x-user-role'] = 'admin';
    }
    return h;
  }

  async function json<T>(endpoint: string, path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithTimeout(`${base}${path}`, init);
    if (!res.ok) {
      throw new DiscutereUnavailableError(endpoint, res.status, '');
    }
    return (await res.json()) as T;
  }

  return {
    async getPersonaConsensus(gapId) {
      const data = await json<{ personas?: DiscuterePersonaConsensus[] }>(
        '/admin/consensus/:gapId/personas',
        `/api/admin/consensus/${encodeURIComponent(gapId)}/personas`,
        { headers: headers() },
      );
      return (data.personas ?? []).map((p) => ({
        personaId: String(p.personaId ?? ''),
        displayName: String(p.displayName ?? p.personaId ?? ''),
        traits: Array.isArray(p.traits) ? p.traits.map(String) : [],
        utterances: (p.utterances ?? []).map((u) => ({
          id: String(u.id ?? ''),
          content: String(u.content ?? ''),
          postedAt: Number(u.postedAt ?? 0),
          agree: typeof u.agree === 'boolean' ? u.agree : null,
          score: typeof u.score === 'number' ? u.score : null,
          reasoning: typeof u.reasoning === 'string' ? u.reasoning : null,
        })),
        opinionScore: Number(p.opinionScore ?? 0),
        consensusScore: Number(p.consensusScore ?? 0),
        agreeRatio: Number(p.agreeRatio ?? 0),
      }));
    },

    async createGap(input) {
      const body: Record<string, string> = { title: input.title, description: input.description };
      if (input.gameId) body.gameId = input.gameId;
      const data = await json<{ gapId?: string; sessionId?: string }>('/admin/gaps', '/api/admin/gaps', {
        method: 'POST',
        headers: headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!data.gapId) throw new DiscutereUnavailableError('/admin/gaps', 200, 'gapId が返らなかった');
      return { gapId: data.gapId, sessionId: String(data.sessionId ?? '') };
    },

    async listGamePatterns(options) {
      const limit = options?.limit ?? 60;
      const detailLimit = options?.detailLimit ?? 24;
      const data = await json<{ games?: Array<Record<string, unknown>> }>(
        '/learning/data',
        `/learning/data?layer=games&limit=${limit}&detailLimit=${detailLimit}`,
        { headers: headers() },
      );
      return (data.games ?? []).map((g) => ({
        gameId: String(g.id ?? ''),
        title: String(g.title ?? ''),
        mechanics: toPatterns(g.mechanics),
        aesthetics: toPatterns(g.aesthetics),
      }));
    },
  };
}

function toPatterns(raw: unknown): Array<{ name: string; description: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const row = entry as { name?: unknown; description?: unknown };
      return {
        name: String(row.name ?? ''),
        description: typeof row.description === 'string' ? row.description : null,
      };
    })
    .filter((p) => p.name !== '');
}
