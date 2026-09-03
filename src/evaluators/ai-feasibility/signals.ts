// AI 実装可否軸の純粋ロジック (設計 §4.3)。
//
// 「AI に委託して一発で通るか」を、 仕様の具体性 / 足場の有無 / 過去実績 の 3 本で測る。
// 過去に見送った理由 (Genius 判断カード) が当たったら減点し、 evidence にそのまま貼る。

import { makeAxisResult, clampUnit, type AxisDraft } from '../axis.ts';
import type { AxisResult, Evidence, Missing } from '../../initiative/types.ts';

/** 仕様の具体性 (LLM 判定)。 各 0..1。 */
export interface SpecificitySignals {
  /** 受け入れ条件があるか。 */
  acceptance: number;
  /** 画面遷移が書かれているか。 */
  screenFlow: number;
  /** データ項目が書かれているか。 */
  dataFields: number;
}

/** 過去実績 1 件 (Genius 判断カード)。 */
export interface PriorJudgment {
  cardId: string;
  situation: string;
  judgment: string;
  /** 検索スコア (大きいほど近い)。 */
  score: number;
  /** その判断が「見送り/却下」だったか。 当たると減点する。 */
  negative: boolean;
  url: string | null;
}

const WEIGHTS = { specificity: 0.4, scaffolding: 0.4, priors: 0.2 };

/** 見送り実績 1 件につき引く点。 */
const NEGATIVE_PRIOR_PENALTY = 10;

export interface AiFeasibilityInput {
  /** LLM が出した仕様の具体性。 取れなければ null。 */
  specificity: SpecificitySignals | null;
  /** 触るドメインの spec-link 密度 0..1 (リンクを持つ関数の割合)。 取れなければ null。 */
  specLinkDensity: number | null;
  /** Augur の per-domain quota 充足率 0..1。 取れなければ null。 */
  testQuotaFill: number | null;
  /** Genius の近い判断カード。 */
  priors: PriorJudgment[];
  /** 委託する場合の分割案 (フルセット原則。 LLM 出力)。 */
  splitPlan: string[];
  missing: Missing[];
}

/** AI 実装可否軸のスコアと根拠を決める。 */
export function scoreAiFeasibility(input: AiFeasibilityInput): AxisResult {
  const evidence: Evidence[] = [];

  const specificity = input.specificity ? averageUnit(Object.values(input.specificity)) : 0.5;
  if (input.specificity) {
    evidence.push({
      source: 'llm',
      label: `仕様の具体性 ${pct(specificity)}`,
      detail:
        `受け入れ条件 ${pct(input.specificity.acceptance)} / 画面遷移 ${pct(input.specificity.screenFlow)} / ` +
        `データ項目 ${pct(input.specificity.dataFields)}`,
    });
  }

  const scaffolding = scaffoldingSignal(input.specLinkDensity, input.testQuotaFill);
  if (input.specLinkDensity !== null) {
    evidence.push({
      source: 'anatomia',
      label: `spec-link 密度 ${pct(input.specLinkDensity)}`,
      detail: '触るドメインの実装関数のうち仕様節に結びついている割合',
    });
  }
  if (input.testQuotaFill !== null) {
    evidence.push({
      source: 'augur',
      label: `テスト登録の充足率 ${pct(input.testQuotaFill)}`,
      detail: 'per-domain quota に対する active テストの割合',
    });
  }

  const priorSignal = priorsSignal(input.priors);
  let score = 100 * (WEIGHTS.specificity * specificity + WEIGHTS.scaffolding * scaffolding + WEIGHTS.priors * priorSignal);

  for (const prior of input.priors.filter((p) => p.negative)) {
    score -= NEGATIVE_PRIOR_PENALTY;
    evidence.push({
      source: 'genius',
      label: `過去に見送った判断が当たった: ${prior.situation}`,
      detail: prior.judgment,
      url: prior.url,
    });
  }
  for (const prior of input.priors.filter((p) => !p.negative)) {
    evidence.push({
      source: 'genius',
      label: `近い過去判断: ${prior.situation}`,
      detail: prior.judgment,
      url: prior.url,
    });
  }

  if (input.splitPlan.length > 0) {
    evidence.push({
      source: 'llm',
      label: '委託する場合の分割案 (フルセット)',
      detail: input.splitPlan.map((step, i) => `${i + 1}. ${step}`).join(' / '),
    });
  }

  const draft: AxisDraft = {
    axis: 'ai-feasibility',
    score,
    // 入力は 4 本 (LLM 具体性 / spec-links / Augur テスト / Genius)。
    signals: 4,
    evidence,
    missing: input.missing,
  };
  return makeAxisResult(draft);
}

/** 足場の signal。 片方しか取れなければ取れた側だけで出す (欠損は confidence 側で効かせる)。 */
export function scaffoldingSignal(specLinkDensity: number | null, testQuotaFill: number | null): number {
  const values = [specLinkDensity, testQuotaFill].filter((v): v is number => v !== null);
  if (values.length === 0) return 0.5;
  return averageUnit(values);
}

/**
 * 過去実績の signal。 近い判断が 1 件も無ければ中立 0.5。
 * 肯定的な判断が多いほど上がり、 見送り判断が多いほど下がる。
 */
export function priorsSignal(priors: readonly PriorJudgment[]): number {
  if (priors.length === 0) return 0.5;
  const positive = priors.filter((p) => !p.negative).length;
  return clampUnit(positive / priors.length);
}

function averageUnit(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return clampUnit(values.reduce((a, b) => a + clampUnit(b), 0) / values.length);
}

function pct(value: number): string {
  return `${Math.round(clampUnit(value) * 100)}%`;
}
