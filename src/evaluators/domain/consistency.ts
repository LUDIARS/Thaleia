// ドメイン解析軸の純粋ロジック (設計 §4.4)。
//
// 「触るドメインが二層 (業務/プログラム) で整合しているか」と「返済が溜まっていないか」で測る。
// 二層が食い違うドメインを触る施策は着地点が不安定なので減点し、 溜まった refactoring 提案は
// 「先に返済」として evidence に出す。

import { makeAxisResult, clampUnit, type AxisDraft } from '../axis.ts';
import type { AxisResult, Evidence, Missing } from '../../initiative/types.ts';

/** 触るドメイン 1 件の二層整合。 */
export interface DomainLayerStatus {
  domain: string;
  /** 業務ドメインとして宣言されているか。 */
  inBusinessLayer: boolean;
  /** プログラムドメインとして検出されているか。 */
  inProgramLayer: boolean;
  /** 業務↔プログラムの相互参照が張れているか。 */
  linked: boolean;
  /** レイヤ規約に合わない記号数。 */
  misfitCount: number;
  /** そのドメインに溜まっている refactoring 提案。 */
  openProposals: Array<{ proposalId: string; rule: string; action: string }>;
}

/** 二層不整合 1 件につき引く点。 */
const MISMATCH_PENALTY = 15;
/** 未返済の refactoring 提案 1 件につき引く点 (ドメインあたり上限あり)。 */
const PROPOSAL_PENALTY = 5;
const PROPOSAL_PENALTY_CAP = 15;

export interface DomainConsistencyInput {
  statuses: DomainLayerStatus[];
  /** ゲート A/B/C の試算で見つかった衝突 (新規ドメインが要るとき)。 */
  organizationConflicts: string[];
  missing: Missing[];
}

/** 二層整合の集計結果 (デグレード判定の入力にもなる)。 */
export interface DomainConsistencySummary {
  /** 触るドメイン数。 */
  total: number;
  /** 二層が食い違っているドメイン数。 */
  mismatched: number;
  /** 未返済の refactoring 提案の総数。 */
  openProposals: number;
  /** 0..1。 1 = 全ドメインが不整合。 */
  mismatchRatio: number;
}

/** ドメイン解析軸のスコアと根拠を決める。 */
export function scoreDomain(input: DomainConsistencyInput): AxisResult {
  const evidence: Evidence[] = [];
  const missing = [...input.missing];
  const summary = summarizeConsistency(input.statuses);

  if (summary.total === 0) {
    missing.push({
      code: 'domain_no_target_domain',
      reason: '企画本文から触るドメインを特定できなかったため二層整合を判定できない',
    });
  }

  let score = 100;
  for (const status of input.statuses) {
    if (isMismatched(status)) {
      score -= MISMATCH_PENALTY;
      evidence.push({
        source: 'anatomia',
        label: `二層不整合: ${status.domain}`,
        detail: describeMismatch(status),
      });
    }
    if (status.openProposals.length > 0) {
      score -= Math.min(PROPOSAL_PENALTY_CAP, status.openProposals.length * PROPOSAL_PENALTY);
      evidence.push({
        source: 'anatomia',
        label: `先に返済: ${status.domain} に未処理の整理提案 ${status.openProposals.length} 件`,
        detail: status.openProposals.map((p) => `${p.rule}: ${p.action}`).join(' / '),
      });
    }
  }

  for (const conflict of input.organizationConflicts) {
    score -= MISMATCH_PENALTY;
    evidence.push({ source: 'anatomia', label: 'ドメイン組織の衝突', detail: conflict });
  }

  if (summary.total > 0 && summary.mismatched === 0 && summary.openProposals === 0) {
    evidence.push({
      source: 'anatomia',
      label: `触るドメイン ${summary.total} 件は二層整合・返済なし`,
      detail: input.statuses.map((s) => s.domain).join(', '),
    });
  }

  const draft: AxisDraft = {
    axis: 'domain',
    // ドメインを特定できなかったときは満点を出さない (根拠が無い 100 点は誤解を生む)。
    score: summary.total === 0 ? 50 : score,
    // 入力は 3 本 (business-domain-view / program-domain-view / refactoring proposals)。
    signals: 3,
    evidence,
    missing,
  };
  return makeAxisResult(draft);
}

/** 二層が食い違っているか。 片側にしか居ない、 または相互参照が張れていない。 */
export function isMismatched(status: DomainLayerStatus): boolean {
  if (!status.inBusinessLayer || !status.inProgramLayer) return true;
  return !status.linked;
}

function describeMismatch(status: DomainLayerStatus): string {
  if (!status.inBusinessLayer) return '業務ドメインとして宣言されていない (実装だけが在る)';
  if (!status.inProgramLayer) return 'プログラムドメインとして検出されていない (仕様だけが在る)';
  return `業務↔プログラムの相互参照が無い (misfit ${status.misfitCount} 件)`;
}

/** 二層整合の集計 (デグレード判定へ渡す)。 */
export function summarizeConsistency(statuses: readonly DomainLayerStatus[]): DomainConsistencySummary {
  const total = statuses.length;
  const mismatched = statuses.filter(isMismatched).length;
  const openProposals = statuses.reduce((sum, s) => sum + s.openProposals.length, 0);
  return {
    total,
    mismatched,
    openProposals,
    mismatchRatio: total === 0 ? 0 : clampUnit(mismatched / total),
  };
}
