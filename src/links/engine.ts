// spec-link ワークリストエンジン — Anatomia から spec-links + graph を取得 → 純粋関数で組む。

import { buildLinkWorklist } from './worklist.ts';
import type { LinkWorklistResult } from './worklist.ts';
import type { AnatomiaClient } from '../clients/anatomia.ts';

export interface LinkWorklistParams {
  /** Anatomia の project id。 */
  project: string;
  /** 低 confidence 閾値 (0..1)。 */
  confidenceThreshold: number;
  maxItems?: number;
}

/**
 * 未批准・低 confidence の spec-link ワークリストを返す。 Anatomia のみ呼ぶ。
 * graph も引いて from(anchor/ファイル) を関数名へ解決し、 表示を補う。
 */
export async function runLinkWorklist(
  an: AnatomiaClient,
  params: LinkWorklistParams,
): Promise<LinkWorklistResult> {
  const [specLinks, graph] = await Promise.all([
    an.listSpecLinks(params.project),
    an.fetchGraph(params.project),
  ]);
  return buildLinkWorklist({
    specLinks,
    confidenceThreshold: params.confidenceThreshold,
    graph,
    maxItems: params.maxItems,
  });
}
