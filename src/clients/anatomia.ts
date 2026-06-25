// Anatomia API クライアント — コード解析の検出ドメインを取得する。
//
// Anatomia の web server (`anatomia web --port 4200`) は loopback で無認証。
// GET /api/domains?project=<id> は「実装関数を持つ (>0) 検出ドメイン名」を返す
// (src/adapters/web/server.ts)。 v1 はこの存在情報のみ使う (実装あり/なしの判定に十分)。

import type { AnatomiaDomain } from '../reconcile/types.ts';

export interface AnatomiaClient {
  /** 実装を持つ検出ドメインの一覧。 */
  listDomains(project: string): Promise<AnatomiaDomain[]>;
}

export interface AnatomiaClientOptions {
  baseUrl: string;
}

export function makeAnatomiaClient(opts: AnatomiaClientOptions): AnatomiaClient {
  const base = opts.baseUrl.replace(/\/$/, '');

  return {
    async listDomains(project) {
      const res = await fetch(
        `${base}/api/domains?project=${encodeURIComponent(project)}`,
        { headers: { accept: 'application/json' } },
      );
      if (!res.ok) throw new Error(`anatomia /api/domains -> HTTP ${res.status}`);
      const data = (await res.json()) as { domains?: string[] };
      // /api/domains は implementors>0 のドメイン名のみ返すので、 存在 = implementorCount 1。
      return (data.domains ?? []).map((name) => ({ name, implementorCount: 1 }));
    },
  };
}
