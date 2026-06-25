// リレーエンジン — Anatomia からグラフ + (必要なら) ドメイン実装を取得 → 純粋関数で絞り込む。

import type { RelayRequest, RelayResult } from './types.ts';
import { selectRelayGraph } from './select.ts';
import type { AnatomiaClient } from '../clients/anatomia.ts';

/**
 * Praeforma の studio リレーに応える。 Anatomia のみ呼ぶ (Praeforma は呼ばない — 主体が
 * Praeforma なので逆流させない)。 対象/検索語に関連する部分グラフを返す。
 */
export async function runRelay(an: AnatomiaClient, req: RelayRequest): Promise<RelayResult> {
  const graph = await an.fetchGraph(req.project);

  // ドメイン対象のときだけ実装アンカーを引く (layout は検索語照合のみ)。
  const implementorsByDomain =
    req.target?.kind === 'domain' ? await an.listDomainImplementors(req.project) : {};

  return selectRelayGraph({
    graph,
    implementorsByDomain,
    target: req.target,
    query: req.query,
  });
}
