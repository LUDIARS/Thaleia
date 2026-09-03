// 総合スコアの算出 (設計 §5)。 純粋関数。
//
//   total = Σ_axis (weight_axis * score_axis) − banality_penalty (new-content のみ)

import type { AxisResult, AxisWeights } from '../initiative/types.ts';

/** 重み付き合計から凡庸性ペナルティを引いた総合スコア 0..100。 */
export function computeTotal(
  axes: readonly AxisResult[],
  weights: AxisWeights,
  banalityPenalty: number,
): number {
  let total = 0;
  for (const axis of axes) total += axis.score * (weights[axis.axis] ?? 0);
  return round1(Math.max(0, Math.min(100, total - banalityPenalty)));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
