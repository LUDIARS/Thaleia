// 未批准 spec-link ワークリストの中核 — 純粋関数。 上流 I/O は links/engine 側。
//
// Anatomia の spec-links は confidence(0..1) と ratified(批准済?) を持つ。 ここでは
//   - ratified:false (未批准)
//   - confidence が閾値未満 (低 confidence)
// のいずれかに該当するリンクを「要レビュー」として集め、 棚卸し用に並べ替える。
// graph があれば from(anchor id もしくはファイルパス) を関数名/ファイルに解決して表示を補う。

import type { AnatomiaGraph } from '../clients/anatomia-types.ts';
import type { AnatomiaSpecLink } from '../trace/types.ts';

/** ワークリストが既定で返すリンクの上限。 */
export const MAX_WORKLIST_ITEMS = 300;

/** 要レビュー理由。 */
export type LinkReviewReason = 'unratified' | 'low-confidence';

/** ワークリストの 1 行 (要レビューな spec-link)。 */
export interface LinkWorklistItem {
  /** anchor id もしくはファイルの絶対パス (Anatomia spec-link の from)。 */
  from: string;
  /** Anatomia が付けた from の表示名。 */
  fromName: string;
  /** graph で from を解決できたときの関数/シンボル名 (無ければ null)。 */
  resolvedName: string | null;
  /** graph で解決できたときの宣言ファイルパス (無ければ null)。 */
  resolvedPath: string | null;
  /** spec 節の見出し。 */
  clauseHeading: string;
  /** spec 節が載るファイル。 */
  clauseFile: string;
  confidence: number;
  ratified: boolean;
  /** このリンクが要レビューになった理由 (両方該当することもある)。 */
  reasons: LinkReviewReason[];
}

export interface BuildLinkWorklistParams {
  specLinks: AnatomiaSpecLink[];
  /** この値未満の confidence を「低 confidence」とみなす (0..1)。 */
  confidenceThreshold: number;
  /** from→{name,path} 解決用の graph (任意。 無ければ resolvedName/Path は null)。 */
  graph?: AnatomiaGraph;
  /** 返す行の上限 (既定 MAX_WORKLIST_ITEMS)。 */
  maxItems?: number;
}

export interface LinkWorklistResult {
  /** 適用した低 confidence 閾値。 */
  threshold: number;
  items: LinkWorklistItem[];
  summary: {
    /** 入力 spec-link の総数。 */
    totalLinks: number;
    /** 要レビュー (unratified もしくは low-confidence) の総数 (切り詰め前)。 */
    flagged: number;
    /** 未批准の総数。 */
    unratified: number;
    /** 低 confidence の総数。 */
    lowConfidence: number;
    /** 実際に返した行数。 */
    shown: number;
    /** 上限で切り詰めたか。 */
    truncated: boolean;
  };
}

/**
 * 未批准・低 confidence の spec-link を集めたワークリストを組む (純粋関数)。
 * 並びは「未批准を先・confidence の低い順」= レビュー優先度の高い順。
 */
export function buildLinkWorklist(params: BuildLinkWorklistParams): LinkWorklistResult {
  const { specLinks, confidenceThreshold } = params;
  const maxItems = params.maxItems ?? MAX_WORKLIST_ITEMS;
  const nodeById = new Map((params.graph?.nodes ?? []).map((n) => [n.id, n]));

  let unratified = 0;
  let lowConfidence = 0;
  const flaggedItems: LinkWorklistItem[] = [];

  for (const l of specLinks) {
    const reasons: LinkReviewReason[] = [];
    if (!l.ratified) {
      reasons.push('unratified');
      unratified++;
    }
    if (l.confidence < confidenceThreshold) {
      reasons.push('low-confidence');
      lowConfidence++;
    }
    if (reasons.length === 0) continue;
    const node = nodeById.get(l.from);
    flaggedItems.push({
      from: l.from,
      fromName: l.fromName,
      resolvedName: node?.name ?? null,
      resolvedPath: node?.path ?? null,
      clauseHeading: l.clauseHeading,
      clauseFile: l.clauseFile,
      confidence: l.confidence,
      ratified: l.ratified,
      reasons,
    });
  }

  // 未批准を先に、 次いで confidence 昇順 (低いほど優先)、 安定のため見出しで tie-break。
  flaggedItems.sort(
    (a, b) =>
      Number(a.ratified) - Number(b.ratified) ||
      a.confidence - b.confidence ||
      a.clauseHeading.localeCompare(b.clauseHeading),
  );

  const truncated = flaggedItems.length > maxItems;
  const items = truncated ? flaggedItems.slice(0, maxItems) : flaggedItems;

  return {
    threshold: confidenceThreshold,
    items,
    summary: {
      totalLinks: specLinks.length,
      flagged: flaggedItems.length,
      unratified,
      lowConfidence,
      shown: items.length,
      truncated,
    },
  };
}
