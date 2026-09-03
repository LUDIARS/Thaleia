// 総合 confidence の算出 (設計 §5)。 純粋関数。
//
//   confidence = Π_axis confidence_axis × applicable_rule_confidence
//   (種別ルールに missing があれば rule confidence = 0.5)
//
// 0.5 未満はビューアで「判定保留」と表示する。 判定そのものは出すが、 その確からしさを併記する
// (上流が欠けたことを黙って無かったことにしない)。

import type { AxisResult, Missing } from '../initiative/types.ts';

/** 判定保留とみなす confidence の下限。 */
export const CONFIDENCE_HOLD_THRESHOLD = 0.5;

/**
 * 軸 confidence の積。種別ルールに欠損があれば、その判定材料が不完全なことを 0.5 倍で表す。
 * missing 件数をそのまま掛けないのは、同じ上流障害から派生した missing の重複で過剰に下げないため。
 */
export function computeConfidence(
  axes: readonly AxisResult[],
  ruleMissing: readonly Missing[] = [],
): number {
  if (axes.length === 0) return 0;
  let product = 1;
  for (const axis of axes) product *= Math.max(0, Math.min(1, axis.confidence));
  if (ruleMissing.length > 0) product *= 0.5;
  return Math.round(product * 1000) / 1000;
}

