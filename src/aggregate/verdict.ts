// 判定 (verdict) の決定 (設計 §5)。 純粋関数。
//
//   improvement かつ degrade_risk >= DEFER_THRESHOLD → defer
//   total >= 70 かつ Di 象限 I が過半               → go
//   total >= 50                                    → conditional (条件 = missing / 減点理由)
//   それ以外                                       → no-go

import type { AxisResult, Missing, Verdict } from '../initiative/types.ts';
import { hasQuadrantOneMajority } from '../evaluators/discussion/quadrant.ts';
import type { Quadrant } from '../initiative/types.ts';

export const GO_THRESHOLD = 70;
export const CONDITIONAL_THRESHOLD = 50;

export interface VerdictInput {
  total: number;
  /** 見送りルールの結果。 true なら他を見ずに defer。 */
  defer: boolean;
  /** Di 議論の象限内訳。 議論が取れなければ null。 */
  quadrantCounts: Record<Quadrant, number> | null;
}

/** 判定を決める。 */
export function decideVerdict(input: VerdictInput): Verdict {
  if (input.defer) return 'defer';
  // 象限が取れないときに「過半あり」とは言えないので go には上げない (conditional 止まり)。
  const majority = input.quadrantCounts ? hasQuadrantOneMajority(input.quadrantCounts) : false;
  if (input.total >= GO_THRESHOLD && majority) return 'go';
  if (input.total >= CONDITIONAL_THRESHOLD) return 'conditional';
  return 'no-go';
}

/**
 * conditional のときに付ける条件。
 * 「取れなかった上流」と「減点理由」をそのまま条件として並べる (何を埋めれば go かを示す)。
 */
export function buildConditions(
  axes: readonly AxisResult[],
  reasons: readonly string[],
  ruleMissing: readonly Missing[] = [],
): string[] {
  const conditions: string[] = [];
  for (const axis of axes) {
    for (const missing of axis.missing) {
      conditions.push(`${axis.axis} 軸の欠損を埋める: ${missing.reason}`);
    }
  }
  for (const missing of ruleMissing) {
    conditions.push(`種別ルールの欠損を埋める: ${missing.reason}`);
  }
  conditions.push(...reasons);
  return conditions;
}
