// Anatomia API クライアント — コード解析の検出ドメインを取得する。
//
// Anatomia の web server (`anatomia web --port 4200`) は loopback で無認証。
// GET /api/domains?project=<id> は「実装関数を持つ (>0) 検出ドメイン名」を返す
// (src/adapters/web/server.ts)。 v1 はこの存在情報のみ使う (実装あり/なしの判定に十分)。

import type { AnatomiaDomain, AnatomiaScreen } from '../reconcile/types.ts';
import type { AnatomiaGraph } from '../relay/types.ts';
import type { AnatomiaSpecLink } from '../trace/types.ts';

export interface AnatomiaClient {
  /** 実装を持つ検出ドメインの一覧。 */
  listDomains(project: string): Promise<AnatomiaDomain[]>;
  /** 検出された UI スクリーン/シーンの一覧。 */
  listScreens(project: string): Promise<AnatomiaScreen[]>;
  /** コード↔リポ spec 節リンク (関数粒度トレース用)。 */
  listSpecLinks(project: string): Promise<AnatomiaSpecLink[]>;
  /** コードグラフ全量 (関数粒度のノード + calls/depends 等のエッジ)。 */
  fetchGraph(project: string): Promise<AnatomiaGraph>;
  /** 検出ドメイン名 → 実装 AnchorId 群 (domain-view より)。 */
  listDomainImplementors(project: string): Promise<Record<string, string[]>>;
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

    async listScreens(project) {
      // GET /api/projects/:id/screens → { screens: [{ name, ... }] }。 存在 = 実装あり。
      const res = await fetch(
        `${base}/api/projects/${encodeURIComponent(project)}/screens`,
        { headers: { accept: 'application/json' } },
      );
      if (!res.ok) throw new Error(`anatomia /screens -> HTTP ${res.status}`);
      const data = (await res.json()) as { screens?: Array<{ name: string }> };
      return (data.screens ?? []).map((s) => ({ name: s.name }));
    },

    async listSpecLinks(project) {
      // GET /api/projects/:id/spec-links → SpecLinkRow[] (from は anchor id もしくはファイルパス)。
      const res = await fetch(
        `${base}/api/projects/${encodeURIComponent(project)}/spec-links`,
        { headers: { accept: 'application/json' } },
      );
      if (!res.ok) throw new Error(`anatomia /spec-links -> HTTP ${res.status}`);
      const data = (await res.json()) as Array<{
        from?: string;
        fromName?: string;
        clauseHeading?: string;
        clauseFile?: string;
        confidence?: number;
        ratified?: boolean;
      }>;
      return (Array.isArray(data) ? data : []).map((l) => ({
        from: l.from ?? '',
        fromName: l.fromName ?? '',
        clauseHeading: l.clauseHeading ?? '',
        clauseFile: l.clauseFile ?? '',
        confidence: typeof l.confidence === 'number' ? l.confidence : 0,
        ratified: Boolean(l.ratified),
      }));
    },

    async fetchGraph(project) {
      // GET /api/graph?project=<id> → { nodes: CodeNode[], edges: Edge[] }。
      const res = await fetch(`${base}/api/graph?project=${encodeURIComponent(project)}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`anatomia /api/graph -> HTTP ${res.status}`);
      const data = (await res.json()) as {
        nodes?: Array<{ id: string; name: string; kind: string; sourceRange?: { filePath?: string } }>;
        edges?: Array<{ from: string; to: string; kind: string }>;
      };
      return {
        nodes: (data.nodes ?? []).map((n) => ({
          id: n.id,
          name: n.name,
          kind: n.kind,
          path: n.sourceRange?.filePath ?? '',
        })),
        edges: (data.edges ?? []).map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
      };
    },

    async listDomainImplementors(project) {
      // GET /api/projects/:id/domain-view → { views: { domain, implementors }[] }。
      const res = await fetch(
        `${base}/api/projects/${encodeURIComponent(project)}/domain-view`,
        { headers: { accept: 'application/json' } },
      );
      if (!res.ok) throw new Error(`anatomia /domain-view -> HTTP ${res.status}`);
      const data = (await res.json()) as {
        views?: Array<{ domain: string; implementors?: string[] }>;
      };
      const out: Record<string, string[]> = {};
      for (const v of data.views ?? []) out[v.domain] = v.implementors ?? [];
      return out;
    },
  };
}
