// 評価 1 回で使う Anatomia の事実をまとめて 1 度だけ取得する。
//
// 実装コスト軸 / ドメイン解析軸 / AI 実装可否軸が同じビューを見るので、 軸ごとに叩くと
// 同じ解析を何度も引くことになる。 ここで 1 回引いて共有し、 取れなかったビューは
// missing として持ち回る (軸側が 0 点に落とさず confidence を下げるため)。

import { missingFrom } from './axis.ts';
import { unconfigured } from './context.ts';
import type { AnatomiaClient } from '../clients/anatomia.ts';
import type {
  AnatomiaBusinessDomain,
  AnatomiaDomain,
  AnatomiaEntrypointGraph,
  AnatomiaGraph,
  AnatomiaHotspot,
  AnatomiaProgramDomainView,
} from '../clients/anatomia-types.ts';
import type { AnatomiaSpecLink } from '../trace/types.ts';
import type { Missing } from '../initiative/types.ts';

/** 取れた事実と、 取れなかった理由。 */
export interface ProjectFacts {
  domains: AnatomiaDomain[];
  implementorsByDomain: Record<string, string[]>;
  graph: AnatomiaGraph | null;
  entrypointGraph: AnatomiaEntrypointGraph | null;
  hotspots: AnatomiaHotspot[] | null;
  businessDomains: AnatomiaBusinessDomain[] | null;
  programDomainView: AnatomiaProgramDomainView | null;
  specLinks: AnatomiaSpecLink[] | null;
  modules: Array<{ id: string; layer: string | null; symbolCount: number }> | null;
  missing: Missing[];
}

/** Anatomia の各ビューを並行取得する。 個々の失敗は missing に落として全体は止めない。 */
export async function loadProjectFacts(
  anatomia: AnatomiaClient | null,
  project: string,
): Promise<ProjectFacts> {
  if (!anatomia) {
    return {
      domains: [],
      implementorsByDomain: {},
      graph: null,
      entrypointGraph: null,
      hotspots: null,
      businessDomains: null,
      programDomainView: null,
      specLinks: null,
      modules: null,
      missing: [unconfigured('anatomia', 'ANATOMIA_BASE_URL')],
    };
  }

  const missing: Missing[] = [];
  const settle = async <T>(code: string, load: () => Promise<T>): Promise<T | null> => {
    try {
      return await load();
    } catch (e) {
      missing.push(missingFrom(code, e));
      return null;
    }
  };

  const [
    domains,
    implementorsByDomain,
    graph,
    entrypointGraph,
    hotspots,
    businessDomains,
    programDomainView,
    specLinks,
    modules,
  ] = await Promise.all([
    settle('anatomia_domains_unavailable', () => anatomia.listDomains(project)),
    settle('anatomia_domain_view_unavailable', () => anatomia.listDomainImplementors(project)),
    settle('anatomia_graph_unavailable', () => anatomia.fetchGraph(project)),
    settle('anatomia_entrypoint_graph_unavailable', () => anatomia.fetchEntrypointGraph(project)),
    settle('anatomia_hotspots_unavailable', () => anatomia.listHotspots(project)),
    settle('anatomia_business_domain_view_unavailable', () => anatomia.listBusinessDomains(project)),
    settle('anatomia_program_domain_view_unavailable', () => anatomia.fetchProgramDomainView(project)),
    settle('anatomia_spec_links_unavailable', () => anatomia.listSpecLinks(project)),
    settle('anatomia_modules_unavailable', () => anatomia.listModules(project)),
  ]);

  return {
    domains: domains ?? [],
    implementorsByDomain: implementorsByDomain ?? {},
    graph,
    entrypointGraph,
    hotspots,
    businessDomains,
    programDomainView,
    specLinks,
    modules,
    missing,
  };
}

/** ドメイン 1 件の実装アンカー集合。 */
export function implementorsOf(facts: ProjectFacts, domain: string): Set<string> {
  return new Set(facts.implementorsByDomain[domain] ?? []);
}

/** ドメインの実装ファイル数と関数数 (graph が無ければ 0)。 */
export function domainSize(facts: ProjectFacts, domain: string): { files: number; functions: number } {
  const anchors = implementorsOf(facts, domain);
  if (!facts.graph || anchors.size === 0) return { files: 0, functions: 0 };
  const files = new Set<string>();
  let functions = 0;
  for (const node of facts.graph.nodes) {
    if (!anchors.has(node.id)) continue;
    functions += 1;
    if (node.path) files.add(node.path);
  }
  return { files: files.size, functions };
}

/**
 * ドメインへの fan-in。 ドメイン外から中の実装アンカーへ入るエッジ数。
 * entrypoint-graph が取れていればそちらを優先し (入口からの実到達)、 無ければコードグラフで代替する。
 */
export function domainFanIn(facts: ProjectFacts, domain: string): number {
  const anchors = implementorsOf(facts, domain);
  if (anchors.size === 0) return 0;
  const edges = preferredFanInEdges(facts);
  let fanIn = 0;
  for (const edge of edges) {
    if (anchors.has(edge.to) && !anchors.has(edge.from)) fanIn += 1;
  }
  return fanIn;
}

/** プロジェクト全体の fan-in 上位 10% 相当値 (デグレード判定の正規化基準)。 */
export function fanInReference(facts: ProjectFacts): number {
  const counts = new Map<string, number>();
  const edges = preferredFanInEdges(facts);
  for (const edge of edges) counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  const sorted = [...counts.values()].sort((a, b) => b - a);
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  return sorted[index] ?? sorted[0] ?? 0;
}

/** 軸ごとに実際に消費するビューの欠損だけを伝播する。 */
export function missingFor(facts: ProjectFacts, codes: readonly string[]): Missing[] {
  const accepted = new Set(['anatomia_unconfigured', ...codes]);
  return facts.missing.filter((missing) => accepted.has(missing.code));
}

function preferredFanInEdges(facts: ProjectFacts): Array<{ from: string; to: string }> {
  const entrypointEdges = facts.entrypointGraph?.edges ?? [];
  return entrypointEdges.length > 0 ? entrypointEdges : facts.graph?.edges ?? [];
}
