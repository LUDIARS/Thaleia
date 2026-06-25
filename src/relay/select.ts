// リレーの中核 — Anatomia 生グラフから対象に関連する部分グラフを切り出す純粋関数。
//
// Thaleia は解析エンジンを二重実装しない。 ここは Anatomia が返したグラフを
// 「対象ドメインの実装 (アンカー) + 検索語に当たるノード」 に絞り込み、 Praeforma の
// code-graph スキーマが飲める形へ正規化するだけ (上流 I/O は engine 側)。
//
// 無言フォールバック禁止: 対象が見つからない/絞り込みが空でも mock を返さず、
// 実際のグラフ事実に基づく空結果 + 理由を summary に明示する。

import type {
  AnatomiaGraph,
  RelayNode,
  RelayEdge,
  RelayRelation,
  RelayNodeType,
  RelayResult,
  RelayTarget,
} from './types.ts';

/** 出力ノードの上限 (グラフ全量返却を防ぐ。 超過は summary に明示)。 */
export const MAX_RELAY_NODES = 300;

export interface SelectParams {
  graph: AnatomiaGraph;
  /** ドメイン名 → 実装 AnchorId 群 (Anatomia domain-view より)。 layout 対象では空でよい。 */
  implementorsByDomain: Record<string, string[]>;
  target: RelayTarget;
  query?: string;
}

/** Anatomia EdgeKind → Praeforma GraphRelation。 */
function mapRelation(kind: string): RelayRelation {
  switch (kind) {
    case 'calls':
      return 'calls';
    case 'depends':
    case 'includes':
      return 'depends';
    case 'implements':
    case 'overrides':
      return 'implements';
    default:
      // reads/writes/その他は意味付けを弱め related に寄せる。
      return 'related';
  }
}

/** Anatomia NodeKind → Praeforma GraphNodeType。 */
function mapNodeType(kind: string): RelayNodeType {
  return kind === 'file' ? 'file' : 'symbol';
}

/** 大文字小文字を無視した正規化 (ドメイン名照合用)。 */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** 検索語を 2 文字以上のトークンに分解 (小文字化)。 */
function queryTokens(query: string | undefined): string[] {
  if (!query) return [];
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_]+/i)
        .filter((t) => t.length >= 2),
    ),
  );
}

/**
 * 対象に関連する部分グラフを切り出す。
 *
 * アンカー = 対象ドメインの実装 AnchorId 群 (kind=domain のとき)。
 * これに検索語 (name/path にトークンが含まれるノード) を和集合し、
 * 選ばれたノード間のエッジだけを残す。
 */
export function selectRelayGraph(params: SelectParams): RelayResult {
  const { graph, implementorsByDomain, target, query } = params;

  // 1) アンカー: 対象ドメインの実装ノード集合。
  const anchor = new Set<string>();
  let domainMatched: string | null = null;
  if (target.kind === 'domain' && target.name) {
    const wanted = norm(target.name);
    for (const [domain, ids] of Object.entries(implementorsByDomain)) {
      if (norm(domain) === wanted) {
        domainMatched = domain;
        for (const id of ids) anchor.add(id);
      }
    }
  }

  // 2) 検索語照合: name / path にトークンが含まれるノード。
  const tokens = queryTokens(query);
  const byQuery = new Set<string>();
  if (tokens.length > 0) {
    for (const n of graph.nodes) {
      const hay = `${n.name}\n${n.path}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t))) byQuery.add(n.id);
    }
  }

  // 3) 選択集合 = アンカー ∪ 検索一致。
  const selected = new Set<string>([...anchor, ...byQuery]);

  // 4) ノードを安定順 (name) で確定し、 上限で切る。
  const inSelected = graph.nodes.filter((n) => selected.has(n.id));
  inSelected.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const truncated = inSelected.length > MAX_RELAY_NODES;
  const kept = truncated ? inSelected.slice(0, MAX_RELAY_NODES) : inSelected;
  const keptIds = new Set(kept.map((n) => n.id));

  const nodes: RelayNode[] = kept.map((n) => ({
    key: n.id,
    label: n.name,
    type: mapNodeType(n.kind),
    anatomia_ref: { path: n.path, symbol: n.name, kind: n.kind },
  }));

  // 5) エッジは両端が選択ノードに残っているものだけ。
  const edges: RelayEdge[] = [];
  const seenEdge = new Set<string>();
  for (const e of graph.edges) {
    if (!keptIds.has(e.from) || !keptIds.has(e.to)) continue;
    const relation = mapRelation(e.kind);
    const dedup = `${e.from}|${e.to}|${relation}`;
    if (seenEdge.has(dedup)) continue;
    seenEdge.add(dedup);
    edges.push({ from: e.from, to: e.to, relation });
  }

  return { nodes, edges, summary: buildSummary({ target, domainMatched, tokens, anchor, byQuery, kept: kept.length, truncated, totalSelected: inSelected.length }) };
}

interface SummaryParams {
  target: RelayTarget;
  domainMatched: string | null;
  tokens: string[];
  anchor: Set<string>;
  byQuery: Set<string>;
  kept: number;
  truncated: boolean;
  totalSelected: number;
}

/** 何を根拠にどれだけ選んだかを日本語で明示 (空結果でも理由を返す)。 */
function buildSummary(p: SummaryParams): string {
  const parts: string[] = [];
  if (p.target.kind === 'domain') {
    if (p.domainMatched) parts.push(`ドメイン「${p.domainMatched}」の実装 ${p.anchor.size} 関数をアンカー`);
    else parts.push(`ドメイン「${p.target.name ?? '(無名)'}」は Anatomia の検出ドメインに無し`);
  } else {
    parts.push(`layout 対象 (検索語のみで照合)`);
  }
  if (p.tokens.length > 0) parts.push(`検索語 [${p.tokens.join(', ')}] に ${p.byQuery.size} ノード一致`);
  if (p.kept === 0) {
    parts.push('関連処理は見つからなかった');
  } else {
    parts.push(`計 ${p.kept} ノードを返却`);
    if (p.truncated) parts.push(`(上限 ${MAX_RELAY_NODES} で切り詰め。 候補 ${p.totalSelected})`);
  }
  return parts.join(' / ');
}
