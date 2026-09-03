// 実装コスト軸の純粋ロジック (設計 §4.2)。
//
// decision-metrics の「作業コスト (定量)」に対応する。 **日数・金額は出さない**。
// 出すのは変更面積 (ファイル数 / 関数数 / fan-in) だけで、 それを対数で 0..100 に写す。

import { makeAxisResult, NEUTRAL_SCORE, type AxisDraft } from '../axis.ts';
import type { AxisResult, Evidence, Missing } from '../../initiative/types.ts';

/** 触るドメイン 1 件ぶんの面積。 */
export interface DomainSurface {
  domain: string;
  /** そのドメインの実装ファイル数。 */
  files: number;
  /** 実装関数数。 */
  functions: number;
  /** そのドメインへの入力エッジ数 (影響が波及する広さ)。 */
  fanIn: number;
  /** Anatomia の検出ドメインに無く、 新規に作る必要があるか。 */
  isNew: boolean;
}

/** 新規ドメイン 1 件の見積り倍率 (設計 §4.2: 既存中央値 × 1.5)。 */
export const NEW_DOMAIN_FACTOR = 1.5;

/** 面積スコアの写像に使う上限。 これを超えたら 0 点に張り付く。 */
const SURFACE_CEILING = 3000;

export interface CostSurfaceInput {
  /** 触るドメインの面積。 空 (ドメインを特定できなかった) なら中立点 + missing。 */
  surfaces: DomainSurface[];
  /** 既存ドメインの面積中央値 (新規ドメインの見積りに使う)。 */
  medianSurface: number;
  missing: Missing[];
}

/** 変更面積の合計と内訳。 */
export interface CostSurfaceBreakdown {
  /** 面積の合計 (関数 + ファイル×2 + fan-in)。 */
  total: number;
  existing: number;
  fromNewDomains: number;
  newDomainCount: number;
}

/** 実装コスト軸のスコアと根拠を決める。 */
export function scoreCost(input: CostSurfaceInput): AxisResult {
  const evidence: Evidence[] = [];
  const missing = [...input.missing];

  if (input.surfaces.length === 0) {
    missing.push({
      code: 'cost_no_target_domain',
      reason: '企画本文から触るドメインを特定できなかったため面積を出せない',
    });
    return makeAxisResult({ axis: 'cost', score: NEUTRAL_SCORE, signals: 2, evidence, missing });
  }

  const breakdown = summarizeSurface(input.surfaces, input.medianSurface);
  const score = surfaceToScore(breakdown.total);

  evidence.push({
    source: 'anatomia',
    label: `変更面積 ${Math.round(breakdown.total)} (既存 ${Math.round(breakdown.existing)} + 新規 ${Math.round(breakdown.fromNewDomains)})`,
    detail: `触るドメイン ${input.surfaces.length} 件 (うち新規 ${breakdown.newDomainCount} 件)`,
  });
  for (const surface of input.surfaces) {
    evidence.push({
      source: 'anatomia',
      label: `${surface.domain}${surface.isNew ? ' (新規)' : ''}`,
      detail: `ファイル ${surface.files} / 関数 ${surface.functions} / fan-in ${surface.fanIn}`,
    });
  }

  const draft: AxisDraft = {
    axis: 'cost',
    score,
    // 入力は 2 本 (ドメイン特定 / Anatomia の面積)。
    signals: 2,
    evidence,
    missing,
  };
  return makeAxisResult(draft);
}

/** 触るドメインの面積を合算する。 新規ドメインは既存中央値 × 1.5 で見積る。 */
export function summarizeSurface(surfaces: DomainSurface[], medianSurface: number): CostSurfaceBreakdown {
  let existing = 0;
  let fromNewDomains = 0;
  let newDomainCount = 0;
  for (const surface of surfaces) {
    if (surface.isNew) {
      newDomainCount += 1;
      fromNewDomains += Math.max(1, medianSurface) * NEW_DOMAIN_FACTOR;
      continue;
    }
    existing += domainSurfaceSize(surface);
  }
  return { total: existing + fromNewDomains, existing, fromNewDomains, newDomainCount };
}

/**
 * ドメイン 1 件の面積。
 * ファイルは「触る単位」なので関数より重く数え、 fan-in は波及の広さとして足す。
 */
export function domainSurfaceSize(surface: DomainSurface): number {
  return surface.functions + surface.files * 2 + surface.fanIn;
}

/**
 * 面積を 0..100 に写す (小さいほど高得点)。
 * 面積は裾が長いので対数で写す: 面積 0 → 100 点、 SURFACE_CEILING 以上 → 0 点。
 */
export function surfaceToScore(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 100;
  const ratio = Math.log10(1 + total) / Math.log10(1 + SURFACE_CEILING);
  return Math.max(0, 100 * (1 - ratio));
}
