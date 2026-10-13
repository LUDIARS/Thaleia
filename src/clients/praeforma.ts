// Praeforma API クライアント — 人間の仕様概念 (ドメイン定義 + 仕様書) を取得する。
//
// Praeforma は Cernere PASETO 認証。 token は service token を bearer で渡す。
// 返却は Drizzle raw row (camelCase キー)。 id/name/code/title 等の素直なフィールドのみ使う。

import type { PfDomain, PfLayout } from './praeforma-types.ts';
import { fetchWithTimeout } from './fetch.ts';

/** Pf の仕様一覧が既定の 50 件で切られないよう、十分に大きい取得上限を明示する。 */
const PF_SPECS_LIMIT = 500;

export interface PfSpecRow {
  id: string;
  code: string;
  title: string;
  status?: string;
  priority?: string;
}

export interface PfSpecTarget {
  kind: string;
  refId: string;
}

export interface PraeformaClient {
  listDomains(pid: string): Promise<PfDomain[]>;
  listLayouts(pid: string): Promise<PfLayout[]>;
  listSpecs(pid: string): Promise<PfSpecRow[]>;
  getSpecTargets(pid: string, sid: string): Promise<PfSpecTarget[]>;
}

export interface PraeformaClientOptions {
  baseUrl: string;
  token: string | null;
}

export function makePraeformaClient(opts: PraeformaClientOptions): PraeformaClient {
  const base = opts.baseUrl.replace(/\/$/, '');

  async function get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const res = await fetchWithTimeout(`${base}${path}`, { headers });
    if (!res.ok) {
      throw new Error(`praeforma ${path} -> HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  return {
    async listDomains(pid) {
      const data = await get<{ items: Array<{ id: string; name: string; description?: string | null }> }>(
        `/api/projects/${encodeURIComponent(pid)}/domains`,
      );
      return data.items.map((d) => ({ id: d.id, name: d.name, description: d.description ?? null }));
    },
    async listLayouts(pid) {
      // layout = scene (spec §4)。 ローカルモードの 15 テーブルサブセットにも layouts は含まれる。
      const data = await get<{ items: Array<{ id: string; name: string; description?: string | null }> }>(
        `/api/projects/${encodeURIComponent(pid)}/layouts`,
      );
      return data.items.map((l) => ({ id: l.id, name: l.name, description: l.description ?? null }));
    },
    async listSpecs(pid) {
      const data = await get<{ items: PfSpecRow[] }>(
        `/api/projects/${encodeURIComponent(pid)}/specs?limit=${PF_SPECS_LIMIT}`,
      );
      return data.items;
    },
    async getSpecTargets(pid, sid) {
      const data = await get<{ targets?: PfSpecTarget[] }>(
        `/api/projects/${encodeURIComponent(pid)}/specs/${encodeURIComponent(sid)}`,
      );
      return data.targets ?? [];
    },
  };
}
