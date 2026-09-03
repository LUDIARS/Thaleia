// Anatomia API クライアント — コード解析の結果を取得する。
//
// Anatomia の web server (`anatomia web --port 4200`) は loopback で無認証。
// Thaleia は解析を持たないので、 評価に要る素材は全部ここから引く (実装の二重化を避ける)。
// 応答形は Anatomia の src/adapters/web/routes/*.ts に一致させ、 未整備 (409 not-prepared) や
// 404 は呼び出し側が missing として扱えるよう AnatomiaUnavailableError で区別する。

import type { AnatomiaSpecLink } from '../trace/types.ts';
import type {
  AnatomiaBusinessDomain,
  AnatomiaDomain,
  AnatomiaEntrypointGraph,
  AnatomiaGraph,
  AnatomiaHotspot,
  AnatomiaModule,
  AnatomiaProgramDomain,
  AnatomiaProgramDomainView,
  AnatomiaRefactoringProposal,
  AnatomiaScene,
  AnatomiaScreen,
} from './anatomia-types.ts';
import { fetchWithTimeout } from './fetch.ts';

/**
 * 「上流は生きているが、 そのビューが用意されていない/対象が無い」ことを表す。
 * 評価軸はこれを missing の理由として積む (0 点に落とさない)。
 */
export class AnatomiaUnavailableError extends Error {
  constructor(
    public readonly view: string,
    public readonly status: number,
    detail: string,
  ) {
    super(`anatomia ${view} -> HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'AnatomiaUnavailableError';
  }
}

export interface AnatomiaClient {
  /** 実装を持つ検出ドメインの一覧。 */
  listDomains(project: string): Promise<AnatomiaDomain[]>;
  /** 検出された UI スクリーン/シーンの一覧。 */
  listScreens(project: string): Promise<AnatomiaScreen[]>;
  /** シーン知識の一覧 (UX 軸の既存体験)。 */
  listScenes(project: string): Promise<AnatomiaScene[]>;
  /** コード↔リポ spec 節リンク (関数粒度トレース + AI 実装可否軸の足場)。 */
  listSpecLinks(project: string): Promise<AnatomiaSpecLink[]>;
  /** コードグラフ全量 (関数粒度のノード + calls/depends 等のエッジ)。 */
  fetchGraph(project: string): Promise<AnatomiaGraph>;
  /** 検出ドメイン名 → 実装 AnchorId 群 (domain-view より)。 */
  listDomainImplementors(project: string): Promise<Record<string, string[]>>;
  /** モジュール一覧 (変更面積の素材)。 */
  listModules(project: string): Promise<AnatomiaModule[]>;
  /** ホットスポット (結合度 × 複雑度の上位関数)。 */
  listHotspots(project: string): Promise<AnatomiaHotspot[]>;
  /** 入口からの到達グラフ (fan-in の素材)。 */
  fetchEntrypointGraph(project: string): Promise<AnatomiaEntrypointGraph>;
  /** 業務ドメインビュー (二層整合の業務側)。 */
  listBusinessDomains(project: string): Promise<AnatomiaBusinessDomain[]>;
  /** プログラムドメインビュー (二層整合の実装側 + 返済リスト)。 */
  fetchProgramDomainView(project: string): Promise<AnatomiaProgramDomainView>;
  /** リファクタリング提案 (program-domain-view の active findings)。 */
  listRefactoringProposals(project: string): Promise<AnatomiaRefactoringProposal[]>;
}

export interface AnatomiaClientOptions {
  baseUrl: string;
}

export function makeAnatomiaClient(opts: AnatomiaClientOptions): AnatomiaClient {
  const base = opts.baseUrl.replace(/\/$/, '');

  /** JSON GET。 not-prepared / 404 は AnatomiaUnavailableError にして missing へ回す。 */
  async function get<T>(view: string, path: string): Promise<T> {
    const res = await fetchWithTimeout(`${base}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new AnatomiaUnavailableError(view, res.status, '');
    }
    return (await res.json()) as T;
  }

  const forProject = (project: string) => `/api/projects/${encodeURIComponent(project)}`;

  /** program-domain-view を 1 回だけ取り、 二層整合と返済リストの両方に使う。 */
  async function programDomainView(project: string): Promise<AnatomiaProgramDomainView> {
    const data = await get<{
      layers?: Array<{ layer?: string; domains?: Array<Record<string, unknown>> }>;
      proposals?: Array<Record<string, unknown>>;
      modularity?: number;
    }>('program-domain-view', `${forProject(project)}/program-domain-view`);

    const domains: AnatomiaProgramDomain[] = [];
    for (const layer of data.layers ?? []) {
      for (const raw of layer.domains ?? []) {
        domains.push({
          id: String(raw.id ?? ''),
          layer: String(raw.layer ?? layer.layer ?? ''),
          moduleCount: Array.isArray(raw.moduleIds) ? raw.moduleIds.length : 0,
          codeSymbolCount: Array.isArray(raw.codeSymbolIds) ? raw.codeSymbolIds.length : 0,
          misfitCount: typeof raw.misfitCount === 'number' ? raw.misfitCount : 0,
          businessDomains: (Array.isArray(raw.businessDomains) ? raw.businessDomains : []).map((b) => ({
            businessDomainId: String((b as { businessDomainId?: unknown }).businessDomainId ?? ''),
            weight: Number((b as { weight?: unknown }).weight ?? 0),
          })),
        });
      }
    }
    return {
      domains,
      proposals: (data.proposals ?? []).map(toProposal),
      modularity: typeof data.modularity === 'number' ? data.modularity : 0,
    };
  }

  return {
    async listDomains(project) {
      // GET /api/projects/:id/domains -> [{ domain, implementorCount, conforms, violationCount }]
      const data = await get<Array<Record<string, unknown>>>('domains', `${forProject(project)}/domains`);
      return (Array.isArray(data) ? data : [])
        .map((d) => ({
          name: String(d.domain ?? d.name ?? ''),
          implementorCount: typeof d.implementorCount === 'number' ? d.implementorCount : 1,
          conforms: typeof d.conforms === 'boolean' ? d.conforms : null,
          violationCount: typeof d.violationCount === 'number' ? d.violationCount : null,
        }))
        .filter((d) => d.name !== '');
    },

    async listScreens(project) {
      // GET /api/projects/:id/screens -> { screens: [{ name }] }。 存在 = 実装あり。
      const data = await get<{ screens?: Array<{ name?: string }> }>(
        'screens',
        `${forProject(project)}/screens`,
      );
      return (data.screens ?? []).map((s) => ({ name: String(s.name ?? '') })).filter((s) => s.name !== '');
    },

    async listScenes(project) {
      // GET /api/projects/:id/scenes -> { merged: [{ id, name }] } (manual + derived の統合)。
      const data = await get<{ merged?: Array<{ id?: string; name?: string }> }>(
        'scenes',
        `${forProject(project)}/scenes`,
      );
      return (data.merged ?? [])
        .map((s) => ({ id: String(s.id ?? ''), name: String(s.name ?? s.id ?? '') }))
        .filter((s) => s.name !== '');
    },

    async listSpecLinks(project) {
      // GET /api/projects/:id/spec-links -> SpecLinkRow[] (from は anchor id もしくはファイルパス)。
      const data = await get<Array<Record<string, unknown>>>(
        'spec-links',
        `${forProject(project)}/spec-links`,
      );
      return (Array.isArray(data) ? data : []).map((l) => ({
        from: String(l.from ?? ''),
        fromName: String(l.fromName ?? ''),
        clauseHeading: String(l.clauseHeading ?? ''),
        clauseFile: String(l.clauseFile ?? ''),
        confidence: typeof l.confidence === 'number' ? l.confidence : 0,
        ratified: Boolean(l.ratified),
      }));
    },

    async fetchGraph(project) {
      // GET /api/graph?project=<id> -> { nodes: CodeNode[], edges: Edge[] }
      const data = await get<{
        nodes?: Array<{ id: string; name: string; kind: string; sourceRange?: { filePath?: string } }>;
        edges?: Array<{ from: string; to: string; kind: string }>;
      }>('graph', `/api/graph?project=${encodeURIComponent(project)}`);
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
      // GET /api/projects/:id/domain-view -> { views: { domain, implementors }[] }
      const data = await get<{ views?: Array<{ domain: string; implementors?: string[] }> }>(
        'domain-view',
        `${forProject(project)}/domain-view`,
      );
      const out: Record<string, string[]> = {};
      for (const v of data.views ?? []) out[v.domain] = v.implementors ?? [];
      return out;
    },

    async listModules(project) {
      // GET /api/projects/:id/modules -> モジュール評価。 modules 配列の形は上流の評価結果に従う。
      const data = await get<{ modules?: Array<Record<string, unknown>> }>(
        'modules',
        `${forProject(project)}/modules`,
      );
      return (data.modules ?? []).map((m) => ({
        id: String(m.id ?? m.moduleId ?? ''),
        layer: typeof m.layer === 'string' ? m.layer : null,
        symbolCount: Array.isArray(m.symbolIds)
          ? m.symbolIds.length
          : typeof m.symbolCount === 'number'
            ? m.symbolCount
            : 0,
      }));
    },

    async listHotspots(project) {
      // GET /api/projects/:id/hotspots -> 上位関数 (配列 or { hotspots: [] })。
      const data = await get<unknown>('hotspots', `${forProject(project)}/hotspots`);
      const rows: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { hotspots?: unknown[] }).hotspots)
          ? (data as { hotspots: unknown[] }).hotspots
          : [];
      return rows.map((raw) => {
        const h = raw as Record<string, unknown>;
        return {
          id: String(h.id ?? h.anchorId ?? h.name ?? ''),
          name: String(h.name ?? h.symbol ?? ''),
          path: String(h.path ?? h.file ?? ''),
          score: Number(h.score ?? h.coupling ?? h.complexity ?? 0),
        };
      });
    },

    async fetchEntrypointGraph(project) {
      // GET /api/projects/:id/entrypoint-graph -> EntryPointViewPayload (prepare 済キャッシュ)。
      const data = await get<{
        entries?: Array<{ id?: string; name?: string; symbol?: { name?: string } }>;
        graphNodes?: Array<{ anchor?: string; id?: string; name?: string; path?: string; file?: string; reachedFrom?: string[] }>;
        graphEdges?: Array<{ from?: string; to?: string }>;
      }>('entrypoint-graph', `${forProject(project)}/entrypoint-graph`);
      return {
        entries: (data.entries ?? []).map((e) => ({
          id: String(e.id ?? ''),
          name: String(e.name ?? e.symbol?.name ?? ''),
        })),
        nodes: (data.graphNodes ?? []).map((n) => ({
          id: String(n.anchor ?? n.id ?? ''),
          name: String(n.name ?? ''),
          path: String(n.path ?? n.file ?? ''),
          reachedFrom: Array.isArray(n.reachedFrom) ? n.reachedFrom.map(String) : [],
        })),
        edges: (data.graphEdges ?? []).map((e) => ({ from: String(e.from ?? ''), to: String(e.to ?? '') })),
      };
    },

    async listBusinessDomains(project) {
      // GET /api/projects/:id/business-domain-view -> { domains: BusinessDomainViewDomain[] }
      const data = await get<{ domains?: Array<Record<string, unknown>> }>(
        'business-domain-view',
        `${forProject(project)}/business-domain-view`,
      );
      return (data.domains ?? []).map((d) => ({
        id: String(d.id ?? ''),
        name: String(d.name ?? d.id ?? ''),
        status: String(d.status ?? 'missing'),
        programDomains: (Array.isArray(d.programDomains) ? d.programDomains : []).map((p) => ({
          programDomainId: String((p as { programDomainId?: unknown }).programDomainId ?? ''),
          weight: Number((p as { weight?: unknown }).weight ?? 0),
        })),
        specRefCount: Array.isArray(d.specRefs) ? d.specRefs.length : 0,
      }));
    },

    fetchProgramDomainView: programDomainView,

    async listRefactoringProposals(project) {
      // Anatomia の refactoring-tasks は POST (発行) のみで一覧 API を持たない。 active findings は
      // program-domain-view の proposals に載るので、 そちらを読む (2026-09-03 実装で確認)。
      return (await programDomainView(project)).proposals;
    },
  };
}

/** program-domain-view の proposal を Thaleia の表示モデルへ落とす。 */
function toProposal(raw: Record<string, unknown>): AnatomiaRefactoringProposal {
  const targets: unknown[] = Array.isArray(raw.targets) ? raw.targets : [];
  const task = raw.task as { status?: unknown } | undefined;
  return {
    proposalId: String(raw.proposalId ?? ''),
    rule: String(raw.rule ?? ''),
    action: String(raw.action ?? ''),
    targets: targets
      .map((t) => {
        const loc = t as { domainId?: unknown; moduleId?: unknown; id?: unknown; file?: unknown };
        return String(loc.domainId ?? loc.moduleId ?? loc.id ?? loc.file ?? '');
      })
      .filter((t) => t !== ''),
    taskStatus: task?.status === 'open' || task?.status === 'done' ? task.status : null,
  };
}
