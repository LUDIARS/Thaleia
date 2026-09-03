// ペルソナ内部スコアと単独合否の純粋ロジック (設計 §4.5(c)、§8-2 A 案)。
//
//   internal = w_op * norm(opinionScore) + w_cs * norm(consensusScore) + w_tr * traitFit
//   pass     = internal >= threshold(persona)
//
// 各ペルソナは **自分の内部スコアで単独に合否を出す**。 合議で丸めない。
// 閾値は traits から初期化し、 data/personas/<id>.json で上書きできる (engine 側が読み込む)。

import { clampUnit } from '../axis.ts';
import type { PersonaEvaluation, Quadrant } from '../../initiative/types.ts';
import { clampAxis, countQuadrants, hasQuadrantOneMajority, toQuadrant } from './quadrant.ts';

/** 内部スコアの重み。 */
export interface PersonaScoreWeights {
  opinion: number;
  consensus: number;
  traitFit: number;
}

/** 閾値の既定値 (traits で調整する前の基準)。 */
export const BASE_THRESHOLD = 55;

/** 閾値を上げる traits (慎重派は通しにくい)。 */
const CAUTIOUS_TRAITS = ['慎重', '保守', 'リスク', '批判', 'careful', 'conservative', 'critical'];
/** 閾値を下げる traits (新規性重視は通しやすい)。 */
const ADVENTUROUS_TRAITS = ['新規', '挑戦', '実験', '好奇', 'novelty', 'experimental', 'curious'];

/** traits 1 件あたりの閾値調整幅。 */
const TRAIT_THRESHOLD_STEP = 5;
/** 閾値の可動域。 */
const THRESHOLD_MIN = 35;
const THRESHOLD_MAX = 80;

/** 象限 I 過半のときの加点。 */
export const MAJORITY_BONUS = 5;
/** 象限 IV に上位ペルソナが居るときの減点 (1 人あたり)。 */
export const TOP_OPPONENT_PENALTY = 8;
/** 「上位ペルソナ」とみなす内部スコアの分位 (上位 1/3)。 */
const TOP_OPPONENT_QUANTILE = 1 / 3;

/** 1 ペルソナぶんの入力 (Di 集計 + LLM 写像 + 閾値上書き)。 */
export interface PersonaScoreInput {
  personaId: string;
  displayName: string;
  traits: string[];
  /** Di の opinion_scores 合計。 */
  opinionScore: number;
  /** Di の consensus_scores 合計。 */
  consensusScore: number;
  /** traits と施策 kind の相性 0..1 (LLM 1 回で全ペルソナ分)。 */
  traitFit: number;
  /** X: 実現性 −1..+1。 */
  feasibility: number;
  /** Y: 体験価値 −1..+1。 */
  experienceValue: number;
  /** data/personas/<id>.json による閾値上書き (0..100)。 null なら traits から初期化。 */
  thresholdOverride: number | null;
  utterances: Array<{ id: string; content: string; agree: boolean | null; score: number | null }>;
}

/** 軸スコアと内訳。 */
export interface DiscussionScoreResult {
  personas: PersonaEvaluation[];
  quadrantCounts: Record<Quadrant, number>;
  /** pass 内部スコア合計 / 全内部スコア合計 × 100 (加点減点前)。 */
  baseScore: number;
  /** 象限 I 過半による加点。 */
  majorityBonus: number;
  /** 象限 IV の上位ペルソナによる減点。 */
  topOpponentPenalty: number;
  topOpponents: string[];
  /** 加点減点後の軸スコア 0..100。 */
  score: number;
}

/**
 * ペルソナ群の内部スコア・合否・軸スコアを出す。
 *
 * opinionScore / consensusScore は Di 側の合計値で単位が揃っていないので、
 * **この議論の中の最大値**で正規化する (議論をまたいだ絶対比較はしない)。
 */
export function scorePersonas(
  inputs: readonly PersonaScoreInput[],
  weights: PersonaScoreWeights,
): DiscussionScoreResult {
  const maxOpinion = Math.max(0, ...inputs.map((p) => p.opinionScore));
  const maxConsensus = Math.max(0, ...inputs.map((p) => p.consensusScore));

  const personas: PersonaEvaluation[] = inputs.map((input) => {
    const opinion = normalizeWithin(input.opinionScore, maxOpinion);
    const consensus = normalizeWithin(input.consensusScore, maxConsensus);
    const traitFit = clampUnit(input.traitFit);
    const internal =
      100 * (weights.opinion * opinion + weights.consensus * consensus + weights.traitFit * traitFit);
    const threshold = input.thresholdOverride ?? thresholdFromTraits(input.traits);
    return {
      personaId: input.personaId,
      displayName: input.displayName,
      traits: input.traits,
      feasibility: clampAxis(input.feasibility),
      experienceValue: clampAxis(input.experienceValue),
      quadrant: toQuadrant(input.feasibility, input.experienceValue),
      breakdown: { opinion, consensus, traitFit },
      internal: round1(internal),
      threshold: round1(threshold),
      pass: internal >= threshold,
      utterances: input.utterances,
    };
  });

  const quadrantCounts = countQuadrants(personas.map((p) => p.quadrant));
  const totalInternal = personas.reduce((sum, p) => sum + p.internal, 0);
  const passInternal = personas.filter((p) => p.pass).reduce((sum, p) => sum + p.internal, 0);
  const baseScore = totalInternal <= 0 ? 0 : (passInternal / totalInternal) * 100;

  // 内部スコアが全員 0 = 誰の支持も測れていない。 この状態で象限だけを見て加点/減点すると
  // 「支持ゼロなのに加点」という偽の signal になるので、 加点減点は base がある時だけ効かせる。
  const measured = totalInternal > 0;
  const majorityBonus = measured && hasQuadrantOneMajority(quadrantCounts) ? MAJORITY_BONUS : 0;
  const opponents = measured ? topOpponents(personas) : [];
  const topOpponentPenalty = opponents.length * TOP_OPPONENT_PENALTY;

  return {
    personas,
    quadrantCounts,
    baseScore: round1(baseScore),
    majorityBonus,
    topOpponentPenalty,
    topOpponents: opponents.map((p) => p.displayName),
    score: round1(Math.max(0, Math.min(100, baseScore + majorityBonus - topOpponentPenalty))),
  };
}

/**
 * 象限 IV (価値も実現性も認めない) に居る内部スコア上位のペルソナ。
 * 「重要人物が反対」を平均に埋もれさせないための減点対象 (設計 §4.5(c))。
 */
export function topOpponents(personas: readonly PersonaEvaluation[]): PersonaEvaluation[] {
  if (personas.length === 0) return [];
  const sorted = [...personas].sort((a, b) => b.internal - a.internal);
  const topCount = Math.max(1, Math.ceil(sorted.length * TOP_OPPONENT_QUANTILE));
  return sorted.slice(0, topCount).filter((p) => p.quadrant === 'IV');
}

/**
 * traits から閾値を初期化する (設計 §8-2 A 案)。
 * 慎重寄りの trait は閾値を上げ、 新規性重視の trait は下げる。
 */
export function thresholdFromTraits(traits: readonly string[]): number {
  let threshold = BASE_THRESHOLD;
  for (const trait of traits) {
    const normalized = trait.toLowerCase();
    if (CAUTIOUS_TRAITS.some((needle) => normalized.includes(needle.toLowerCase()))) {
      threshold += TRAIT_THRESHOLD_STEP;
    }
    if (ADVENTUROUS_TRAITS.some((needle) => normalized.includes(needle.toLowerCase()))) {
      threshold -= TRAIT_THRESHOLD_STEP;
    }
  }
  return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, threshold));
}

/** 議論内の最大値で正規化する。 最大が 0 (誰も採点されていない) なら 0。 */
function normalizeWithin(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (max <= 0) return 0;
  return clampUnit(value / max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
