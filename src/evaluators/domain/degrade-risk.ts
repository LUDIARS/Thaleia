// 改善タスクのデグレード判定 (設計 §4.6 improvement)。 純粋関数。
//
//   危険度 = fan-in × hotspot 度 × (1 − 回帰テスト充足率) × 二層不整合
//
// 積なので「どれか 1 つでも安全側なら危険度は下がる」。 ただし Augur が safety floor = full を
// 要求しているのに回帰テストが 0 件なら、 他が良くても危険度を上限に張り付ける (設計 §4.6)。

import { clampUnit } from '../axis.ts';
import type { DegradeRiskResult, Missing } from '../../initiative/types.ts';

/** 積の各項が 0 に落ちきらないよう置く下限。 「無情報」を「安全」と読み替えないため。 */
const FLOOR = 0.2;

export interface DegradeRiskInput {
  /** 触るドメインの fan-in の最大値 (entrypoint-graph の入力エッジ数)。 */
  maxFanIn: number;
  /** プロジェクト全体の fan-in 上位 10% 相当値 (正規化の基準)。 0 なら基準無し。 */
  fanInReference: number;
  /** 触るドメインに属する hotspot の数。 */
  hotspotHits: number;
  /** hotspot 一覧の総数 (正規化の分母)。 */
  hotspotTotal: number;
  /** 回帰テスト充足率 0..1 (1 = 充分)。 null なら不明。 */
  regressionCoverage: number | null;
  /** 二層不整合の割合 0..1。 */
  layerMismatchRatio: number;
  /** Augur が要求した検査 (safety floor 判定に使う)。 */
  requiredChecks: string[];
  /** 触るドメインの回帰テスト登録数。 */
  registeredTests: number;
  /** 先に返済すべき refactoring 提案。 */
  openProposals: Array<{ domain: string; rule: string; action: string }>;
  missing: Missing[];
}

/** safety floor = full 相当とみなす検査 id (Augur review-plan の stage id)。 */
const FULL_SAFETY_STAGES = new Set(['spec_requirements', 'anatomia_domain_review', 'reviewer_autofix']);

/** デグレード危険度を出す。 */
export function assessDegradeRisk(input: DegradeRiskInput): DegradeRiskResult {
  const fanIn = normalizeFanIn(input.maxFanIn, input.fanInReference);
  const hotspot = normalizeHotspot(input.hotspotHits, input.hotspotTotal);
  // 不明なら「充分」と読み替えず中立 0.5 に置く (無言フォールバック禁止)。
  const coverage = input.regressionCoverage === null ? 0.5 : clampUnit(input.regressionCoverage);
  const layerMismatch = Math.max(FLOOR, clampUnit(input.layerMismatchRatio));

  let risk = clampUnit(fanIn * hotspot * (1 - coverage) * layerMismatch);

  const missing = [...input.missing];
  const repayFirst: DegradeRiskResult['repayFirst'] = [];

  // safety floor = full を要求されているのに回帰テストが 1 件も無い → 危険度を上限に張る。
  const fullFloor = input.requiredChecks.some((id) => FULL_SAFETY_STAGES.has(id));
  if (fullFloor && input.registeredTests === 0) {
    risk = 1;
    repayFirst.push({
      kind: 'test',
      label: '回帰テストが 1 件も登録されていない',
      detail: `Augur が要求した検査: ${input.requiredChecks.join(', ')}`,
    });
  } else if (coverage < 0.5) {
    repayFirst.push({
      kind: 'test',
      label: `回帰テストの充足率が低い (${Math.round(coverage * 100)}%)`,
      detail: `登録済み ${input.registeredTests} 件`,
    });
  }

  for (const proposal of input.openProposals) {
    repayFirst.push({
      kind: 'refactoring',
      label: `${proposal.domain}: ${proposal.rule}`,
      detail: proposal.action,
    });
  }

  return {
    risk,
    breakdown: {
      fanIn,
      hotspot,
      regressionCoverage: coverage,
      layerMismatch,
    },
    requiredChecks: input.requiredChecks,
    repayFirst,
    missing,
  };
}

/**
 * fan-in を 0..1 に写す。 基準 (上位 10% 相当) 以上なら 1。
 * 基準が取れないときは 0 に落とさず FLOOR に置く (無情報 ≠ 安全)。
 */
export function normalizeFanIn(maxFanIn: number, reference: number): number {
  if (!Number.isFinite(maxFanIn) || maxFanIn <= 0) return FLOOR;
  if (!Number.isFinite(reference) || reference <= 0) return FLOOR;
  return Math.max(FLOOR, clampUnit(maxFanIn / reference));
}

/** hotspot 該当数を 0..1 に写す。 */
export function normalizeHotspot(hits: number, total: number): number {
  if (hits <= 0) return FLOOR;
  if (!Number.isFinite(total) || total <= 0) return FLOOR;
  return Math.max(FLOOR, clampUnit(hits / total));
}
