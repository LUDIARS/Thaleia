// UX 軸の純粋ロジック (設計 §4.1)。
//
// LLM は「ルーブリックの各観点を 0..100 で採点し、 意図された体験を抽出する」ところまでを担う。
// 重み付けと減点 (Augur の体験制約との矛盾) はここで決定的に行い、 fixture でテストする。

import { clampScore, makeAxisResult, NEUTRAL_SCORE, type AxisDraft } from '../axis.ts';
import type { AxisResult, Evidence, Missing } from '../../initiative/types.ts';

/** ルーブリックの観点。 設計 §4.1 の 4 観点。 */
export interface UxRubricScores {
  /** 導線の一貫性。 */
  flowConsistency: number;
  /** 学習コスト (低いほど良い = 高得点)。 */
  learningCost: number;
  /** 既存 UX との整合。 */
  existingFit: number;
  /** 体験の意図が言語化されているか。 */
  intentClarity: number;
}

/** 観点ごとの重み。 「意図された体験の言語化」は Di 議論の種になるので重めに置く。 */
const RUBRIC_WEIGHTS: Record<keyof UxRubricScores, number> = {
  flowConsistency: 0.3,
  learningCost: 0.2,
  existingFit: 0.25,
  intentClarity: 0.25,
};

/** Augur の体験制約 1 件との矛盾。 */
export interface ExperienceConflict {
  /** 制約の名前 (例 応答 20 ms)。 */
  constraint: string;
  /** 企画のどこが矛盾するか。 */
  detail: string;
}

/** 制約 1 件の矛盾につき引く点。 */
const CONFLICT_PENALTY = 8;

export interface UxRubricInput {
  /** LLM の採点。 取れなければ null (missing 扱いで中立点)。 */
  scores: UxRubricScores | null;
  /** LLM が抽出した「意図された体験」。 Di 議論の種になる。 */
  intendedAffect: string | null;
  /** 参照した既存シーン/画面の数 (整合性判断の足場)。 */
  knownSurfaces: number;
  /** Augur の体験制約と企画の矛盾。 */
  conflicts: ExperienceConflict[];
  missing: Missing[];
}

/** UX 軸のスコアと根拠を決める。 */
export function scoreUx(input: UxRubricInput): AxisResult {
  const evidence: Evidence[] = [];
  let score = NEUTRAL_SCORE;

  if (input.scores) {
    score = weightedRubric(input.scores);
    evidence.push({
      source: 'llm',
      label: `ルーブリック採点 ${clampScore(score)} 点`,
      detail:
        `導線 ${input.scores.flowConsistency} / 学習コスト ${input.scores.learningCost} / ` +
        `既存整合 ${input.scores.existingFit} / 意図の言語化 ${input.scores.intentClarity}`,
    });
  }

  if (input.intendedAffect) {
    evidence.push({ source: 'llm', label: '意図された体験', detail: input.intendedAffect });
  }

  if (input.knownSurfaces > 0) {
    evidence.push({
      source: 'anatomia',
      label: `既存シーン/画面 ${input.knownSurfaces} 件を参照`,
      detail: '既存 UX との整合はこの集合を前提に採点している',
    });
  }

  for (const conflict of input.conflicts) {
    score -= CONFLICT_PENALTY;
    evidence.push({
      source: 'augur',
      label: `体験制約と矛盾: ${conflict.constraint}`,
      detail: conflict.detail,
    });
  }

  const draft: AxisDraft = {
    axis: 'ux',
    score,
    // 入力は 3 本 (LLM 採点 / 既存シーン / 体験制約)。
    signals: 3,
    evidence,
    missing: input.missing,
  };
  return makeAxisResult(draft);
}

/** ルーブリック 4 観点の重み付き平均。 */
export function weightedRubric(scores: UxRubricScores): number {
  let total = 0;
  for (const key of Object.keys(RUBRIC_WEIGHTS) as Array<keyof UxRubricScores>) {
    total += clampScore(scores[key]) * RUBRIC_WEIGHTS[key];
  }
  return total;
}
