// 凡庸性ペナルティ (設計 §4.6 new-content、 neco 指示 2)。 純粋関数。
//
// 「新規制作が必要なコンテンツパターンでは、 凡庸であるほどスコアが下がる」。
// 既存パターン集合 = Ludus の game-lexicon + Discutere の mechanics / aesthetics (§8-3 A 案)。
//
// 類似度は本来 embedding で測るが、 embedder を持たない環境では **正規化語彙の重なり**
// (overlap 係数) で代替する。 どちらで測ったかは必ず evidence に方式として書く
// (無言フォールバック禁止 = 黙って別の測り方に落ちない)。

import { overlapCoefficient, tokenSet } from '../text/normalize.ts';
import type { BanalityResult, Missing } from '../initiative/types.ts';

/** 参照する既存パターン 1 件。 */
export interface KnownPattern {
  source: 'ludus' | 'discutere';
  /** 表示名 (evidence に出る)。 */
  name: string;
  /** 照合に使うテキスト (名前 + 要約 + タグ)。 */
  text: string;
}

/** 「当たった」とみなす類似度の下限。 これ未満は無視する。 */
export const MATCH_THRESHOLD = 0.35;
/** 凡庸度に効かせる該当件数の上限 (これ以上は頭打ち)。 */
const MATCH_COUNT_CAP = 5;

export interface BanalityInput {
  /** 企画本文 (title + body)。 */
  text: string;
  patterns: readonly KnownPattern[];
  /** 凡庸度 1.0 のとき total から引く点。 */
  penaltyK: number;
  missing: Missing[];
}

/**
 * 凡庸度とペナルティを出す。
 *
 *   凡庸度 = 最大類似度 × (該当パターン数 / 上限)
 *
 * 「よくある要素をいくつも並べただけ」ほど高くなる。 1 件も当たらない = 新規性が高い →
 * ペナルティ 0 (設計 §4.6)。
 */
export function assessBanality(input: BanalityInput): BanalityResult {
  const missing = [...input.missing];
  if (input.patterns.length === 0) {
    missing.push({
      code: 'banality_no_reference_patterns',
      reason: '参照できる既存パターンが 1 件も無いため凡庸性を判定できない',
    });
    return {
      banality: 0,
      penalty: 0,
      matches: [],
      method: 'token-overlap',
      missing,
    };
  }

  const bodyTokens = tokenSet(input.text);
  const matches = input.patterns
    .map((pattern) => ({
      source: pattern.source,
      pattern: pattern.name,
      similarity: round3(overlapCoefficient(tokenSet(pattern.text), bodyTokens)),
    }))
    .filter((m) => m.similarity >= MATCH_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);

  if (matches.length === 0) {
    return { banality: 0, penalty: 0, matches: [], method: 'token-overlap', missing };
  }

  const maxSimilarity = matches[0]?.similarity ?? 0;
  const countFactor = Math.min(1, matches.length / MATCH_COUNT_CAP);
  const banality = round3(maxSimilarity * countFactor);

  return {
    banality,
    penalty: round1(banality * input.penaltyK),
    // ビューアが並べるので上位だけ返す (根拠として十分な数)。
    matches: matches.slice(0, 10),
    method: 'token-overlap',
    missing,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
