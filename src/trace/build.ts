// 関数粒度トレースの中核 — 純粋関数。 上流 I/O は engine 側。
//
// 対象ドメインの実装関数 (anchor id) を graph で名前/パスに解決し、 各関数に spec-links を
// join する (from===関数id OR from===関数ファイルパス)。 spec 節は confidence 降順。

import { normalizeName } from '../reconcile/match.ts';
import type { AnatomiaGraph } from '../relay/types.ts';
import type { AnatomiaSpecLink, SpecTraceResult, TraceFunction, TraceResult } from './types.ts';

/** 返す関数の上限 (大ドメインで全量返さない。 超過は summary に明示)。 */
export const MAX_TRACE_FUNCTIONS = 200;

export interface BuildTraceParams {
  domain: string;
  /** ドメイン名 → 実装 anchor id 群 (Anatomia domain-view より)。 */
  implementorsByDomain: Record<string, string[]>;
  graph: AnatomiaGraph;
  specLinks: AnatomiaSpecLink[];
  maxFunctions?: number;
}

/** 対象ドメインの実装関数を spec-links 付きで列挙する。 */
export function buildTrace(params: BuildTraceParams): TraceResult {
  const { domain, implementorsByDomain, graph, specLinks } = params;
  const maxFns = params.maxFunctions ?? MAX_TRACE_FUNCTIONS;

  // 1) 対象ドメインの実装 anchor id (大小無視で完全一致)。
  const wanted = normalizeName(domain);
  let implementorIds: string[] | null = null;
  for (const [name, ids] of Object.entries(implementorsByDomain)) {
    if (normalizeName(name) === wanted) {
      implementorIds = ids;
      break;
    }
  }
  if (!implementorIds) {
    return {
      domain,
      matched: false,
      functions: [],
      summary: { functionCount: 0, linkedFunctions: 0, truncated: false, totalImplementors: 0 },
    };
  }

  // 2) graph で id→{name,path} を引く。
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // 3) spec-links を from でグループ化 (from は anchor id もしくはファイルパス)。
  const linksByFrom = new Map<string, AnatomiaSpecLink[]>();
  for (const l of specLinks) {
    const arr = linksByFrom.get(l.from);
    if (arr) arr.push(l);
    else linksByFrom.set(l.from, [l]);
  }

  // 4) 実装関数を解決 + spec-links を join。
  const functions: TraceFunction[] = [];
  for (const id of implementorIds) {
    const node = nodeById.get(id);
    if (!node) continue; // graph に無い anchor はスキップ (古い実装 id 等)。
    // 関数 anchor id 直当て + 所属ファイルパス当ての両方を集めて重複排除。
    const raw = [...(linksByFrom.get(id) ?? []), ...(node.path ? linksByFrom.get(node.path) ?? [] : [])];
    const seen = new Set<string>();
    const links = raw
      .filter((l) => {
        const k = `${l.clauseHeading}|${l.clauseFile}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((l) => ({
        clauseHeading: l.clauseHeading,
        clauseFile: l.clauseFile,
        confidence: l.confidence,
        ratified: l.ratified,
      }))
      .sort((a, b) => b.confidence - a.confidence);
    functions.push({ id, name: node.name, path: node.path, specLinks: links });
  }

  // 5) 安定順 (リンクあり優先 → 名前) で並べ、 上限で切る。
  functions.sort(
    (a, b) =>
      b.specLinks.length - a.specLinks.length ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  const totalImplementors = functions.length;
  const truncated = functions.length > maxFns;
  const kept = truncated ? functions.slice(0, maxFns) : functions;

  return {
    domain,
    matched: true,
    functions: kept,
    summary: {
      functionCount: kept.length,
      linkedFunctions: kept.filter((f) => f.specLinks.length > 0).length,
      truncated,
      totalImplementors,
    },
  };
}

export interface BuildSpecTraceParams {
  specCode: string;
  specTitle: string;
  /** Pf 側で id→name 解決済の target ドメイン名群。 */
  targetDomains: string[];
  /** ドメイン名 → 実装 anchor id 群 (Anatomia domain-view より)。 */
  implementorsByDomain: Record<string, string[]>;
  graph: AnatomiaGraph;
  specLinks: AnatomiaSpecLink[];
  maxFunctions?: number;
}

/**
 * Pf spec → target ドメイン群 → 実装関数 + spec-links を直結する (spec 起点のトレース)。
 *
 * 既存の buildTrace (ドメイン単位) を target ドメインごとに適用して束ねる純粋関数。
 * ドメイン単位の挙動はそのまま再利用するので、 spec 起点でも join ロジックは一致する。
 */
export function buildSpecTrace(params: BuildSpecTraceParams): SpecTraceResult {
  const { specCode, specTitle, targetDomains, implementorsByDomain, graph, specLinks } = params;
  // target ドメインの重複は正規化名で除く (Pf 側の表記ゆれで二重に来る場合に備える)。
  const seen = new Set<string>();
  const uniqueTargets: string[] = [];
  for (const d of targetDomains) {
    const k = normalizeName(d);
    if (seen.has(k)) continue;
    seen.add(k);
    uniqueTargets.push(d);
  }

  const domains = uniqueTargets.map((domain) =>
    buildTrace({
      domain,
      implementorsByDomain,
      graph,
      specLinks,
      maxFunctions: params.maxFunctions,
    }),
  );

  return {
    specCode,
    specTitle,
    targetDomains: uniqueTargets,
    domains,
    summary: {
      domainCount: uniqueTargets.length,
      matchedDomains: domains.filter((d) => d.matched).length,
      functionCount: domains.reduce((n, d) => n + d.summary.functionCount, 0),
      linkedFunctions: domains.reduce((n, d) => n + d.summary.linkedFunctions, 0),
    },
  };
}
