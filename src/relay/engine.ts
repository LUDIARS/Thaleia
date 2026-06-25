// リレーエンジン — Anatomia からグラフ + (必要なら) ドメイン実装を取得 → 純粋関数で絞り込む。
// opt-in で LLM 意味ランキングを掛ける (rank 指定時)。

import type { RelayRequest, RelayResult } from './types.ts';
import { selectRelayGraph } from './select.ts';
import { rankRelayResult } from './rank.ts';
import type { ClaudeRunner } from '../llm/claude.ts';
import type { AnatomiaClient } from '../clients/anatomia.ts';

/** LLM ランキングを掛ける場合の依存 (route が config から組む)。 未指定なら構造選択のみ。 */
export interface RelayRankOptions {
  run: ClaudeRunner;
  topK: number;
}

/**
 * Praeforma の studio リレーに応える。 Anatomia のみ呼ぶ (Praeforma は呼ばない — 主体が
 * Praeforma なので逆流させない)。 対象/検索語に関連する部分グラフを返す。
 * rank 指定時は構造候補を LLM で意味ランキングして上位 K 件へ絞る。
 */
export async function runRelay(
  an: AnatomiaClient,
  req: RelayRequest,
  rank?: RelayRankOptions,
): Promise<RelayResult> {
  const graph = await an.fetchGraph(req.project);

  // ドメイン対象のときだけ実装アンカーを引く (layout は検索語照合のみ)。
  const implementorsByDomain =
    req.target?.kind === 'domain' ? await an.listDomainImplementors(req.project) : {};

  const structural = selectRelayGraph({
    graph,
    implementorsByDomain,
    target: req.target,
    query: req.query,
  });

  if (!rank) return structural;

  return rankRelayResult(
    structural,
    {
      target: req.target,
      requirements: req.requirements ?? [],
      query: req.query,
      topK: rank.topK,
    },
    rank.run,
  );
}
