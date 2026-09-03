// 評価軸を組み立てる共通の純粋関数。 各軸はここを通して AxisResult を作る。
//
// 方針 (設計 §4): 上流が取れない軸は **0 点にせず missing を積んで confidence を落とす**。
// そのため「スコア」と「確からしさ」を必ず別物として扱い、 missing 件数から confidence を導く。

import type { AxisId, AxisResult, Evidence, Missing } from '../initiative/types.ts';

/** 0..100 に丸める。 */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

/** 0..1 に丸める。 */
export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

/**
 * 軸の confidence を出す。
 *
 * signals = その軸が本来使う入力の本数、 missing = 取れなかった本数。
 * 取れた割合をそのまま confidence にし、 全滅 (取れた入力ゼロ) でも 0 にはせず下限 0.05 を残す
 * (「何も分からない」も 1 つの情報で、 総合 confidence を潰し切ると diff が読めなくなるため)。
 */
export function confidenceFromCoverage(signals: number, missing: number): number {
  if (signals <= 0) return 0.05;
  const available = Math.max(0, signals - missing);
  return clampUnit(Math.max(0.05, available / signals));
}

/** 欠損が無いときに使う中立スコア。 「分からない」を減点にも加点にもしない。 */
export const NEUTRAL_SCORE = 50;

export interface AxisDraft {
  axis: AxisId;
  score: number;
  /** その軸が使う入力の総数 (confidence の分母)。 */
  signals: number;
  evidence: Evidence[];
  missing: Missing[];
}

/** AxisResult を組み立てる (score/confidence の丸めと missing 由来の confidence をここで統一)。 */
export function makeAxisResult(draft: AxisDraft): AxisResult {
  return {
    axis: draft.axis,
    score: clampScore(draft.score),
    confidence: confidenceFromCoverage(draft.signals, draft.missing.length),
    evidence: draft.evidence,
    missing: draft.missing,
  };
}

/** 上流エラーを missing 1 件に落とす (理由の文面をここで統一する)。 */
export function missingFrom(code: string, error: unknown): Missing {
  if (!(error instanceof Error)) return { code, reason: `${code} の取得に失敗した` };

  // 評価結果はファイルへ保存され、HTTP でも返る。Node の fs/fetch 例外や将来追加される
  // 上流エラーはローカルパス、private endpoint、応答本文を含み得るため message を保存しない。
  // 機械可読 code と例外種別だけで、失敗箇所は特定できる。
  return {
    code,
    reason: `${code} の取得に失敗した (${error.name})`,
  };
}
