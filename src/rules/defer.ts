// 見送り (defer) ルール (設計 §4.6 improvement、 neco 指示 3)。 純粋関数。
//
// 危険度が DEFER_THRESHOLD (既定 0.7、 §8-4 A 案) 以上なら、 **他の軸がどれだけ良くても**
// verdict = defer にする。 理由と「先にやるべき返済」を添えて、 判断の根拠を残す。

import type { DegradeRiskResult, InitiativeKind } from '../initiative/types.ts';

export interface DeferDecision {
  /** 見送りにするか。 */
  defer: boolean;
  /** 見送りの理由 (人が読む)。 defer=false なら空。 */
  reasons: string[];
}

export interface DeferInput {
  kind: InitiativeKind;
  /** improvement のときのデグレード判定。 new-content では null。 */
  degrade: DegradeRiskResult | null;
  /** 0..1。 */
  threshold: number;
}

/** 見送り判定。 improvement 以外は常に false (凡庸性は別ルール)。 */
export function decideDefer(input: DeferInput): DeferDecision {
  if (input.kind !== 'improvement' || !input.degrade) return { defer: false, reasons: [] };
  if (input.degrade.risk < input.threshold) return { defer: false, reasons: [] };

  const b = input.degrade.breakdown;
  const reasons = [
    `デグレード危険度 ${input.degrade.risk.toFixed(2)} が見送り閾値 ${input.threshold.toFixed(2)} を超えた`,
    `内訳: fan-in ${b.fanIn.toFixed(2)} × hotspot ${b.hotspot.toFixed(2)} × ` +
      `(1 − 回帰テスト充足 ${b.regressionCoverage.toFixed(2)}) × 二層不整合 ${b.layerMismatch.toFixed(2)}`,
  ];
  for (const item of input.degrade.repayFirst) {
    reasons.push(`先に返済: ${item.label}${item.detail ? ` (${item.detail})` : ''}`);
  }
  return { defer: true, reasons };
}
