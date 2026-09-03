// 評価パイプライン — 5 軸 + 種別ルール + 集計を 1 回の評価にまとめる (設計 §4〜§5)。
//
// 順序に意味があるのは 2 箇所だけ:
//   1. UX 軸が抽出する「意図された体験」を Di の議論起票に使う → UX を先に回す
//   2. 触るドメインの解決 (LLM + 名寄せ) は実装コスト軸とドメイン解析軸で共有する
// それ以外は並行に回してよい。

import { computeConfidence } from '../aggregate/confidence.ts';
import { computeTotal } from '../aggregate/total.ts';
import { buildConditions, decideVerdict } from '../aggregate/verdict.ts';
import { evaluateBanality } from '../rules/banality-engine.ts';
import { decideDefer } from '../rules/defer.ts';
import { evaluateAiFeasibility } from './ai-feasibility/engine.ts';
import { evaluateCost } from './cost/engine.ts';
import { evaluateDiscussion } from './discussion/engine.ts';
import { evaluateDomain } from './domain/engine.ts';
import { evaluateUx } from './ux/engine.ts';
import { loadProjectFacts } from './project-facts.ts';
import { resolveDomainTargets } from './targets.ts';
import type { EvaluationContext } from './context.ts';
import type { AxisResult, Evaluation } from '../initiative/types.ts';

/** 施策を 1 回評価する。 */
export async function runEvaluation(context: EvaluationContext, now: string): Promise<Evaluation> {
  const { deps, initiative } = context;

  // UX 軸と Anatomia の事実取得は互いに独立なので並行に回す。
  const [ux, facts] = await Promise.all([
    evaluateUx(context),
    loadProjectFacts(deps.anatomia, initiative.project),
  ]);

  const targets = await resolveDomainTargets(deps.llm, initiative, facts.domains);

  const [aiFeasibility, domainOutcome, discussion, banality] = await Promise.all([
    evaluateAiFeasibility({ context, facts, targets: targets.targets, missing: targets.missing }),
    evaluateDomain({ context, facts, targets: targets.targets, missing: targets.missing }),
    evaluateDiscussion({ context, intendedAffect: ux.intendedAffect }),
    initiative.kind === 'new-content' ? evaluateBanality(context) : Promise.resolve(null),
  ]);

  const cost = evaluateCost({ facts, targets: targets.targets, missing: targets.missing });

  const axes: AxisResult[] = [ux.axis, cost, aiFeasibility, domainOutcome.axis, discussion.axis];
  const total = computeTotal(axes, deps.config.weights, banality?.penalty ?? 0);
  const deferDecision = decideDefer({
    kind: initiative.kind,
    degrade: domainOutcome.degrade,
    threshold: deps.config.deferThreshold,
  });
  const verdict = decideVerdict({
    total,
    defer: deferDecision.defer,
    quadrantCounts: discussion.hasCompleteMapping ? discussion.detail?.quadrantCounts ?? null : null,
  });

  const reasons = collectReasons(axes, banality?.penalty ?? 0, deferDecision.reasons, discussion);
  const ruleMissing = banality?.missing ?? domainOutcome.degrade?.missing ?? [];

  return {
    initiativeId: initiative.id,
    title: initiative.title,
    kind: initiative.kind,
    project: initiative.project,
    evaluatedAt: now,
    axes,
    discussion: discussion.detail,
    banality,
    degrade: domainOutcome.degrade,
    total,
    verdict,
    confidence: computeConfidence(axes, ruleMissing),
    reasons,
    conditions: verdict === 'conditional' ? buildConditions(axes, reasons, ruleMissing) : [],
    weights: deps.config.weights,
  };
}

/** 減点理由を人が読む形で並べる。 */
function collectReasons(
  axes: readonly AxisResult[],
  banalityPenalty: number,
  deferReasons: readonly string[],
  discussion: { detail: { topOpponentPenalty: number; topOpponents: string[] } | null },
): string[] {
  const reasons: string[] = [...deferReasons];
  if (banalityPenalty > 0) {
    reasons.push(`凡庸性ペナルティ −${banalityPenalty} 点 (既存パターンとの重なりが大きい)`);
  }
  if (discussion.detail && discussion.detail.topOpponentPenalty > 0) {
    reasons.push(
      `内部スコア上位のペルソナが反対 (−${discussion.detail.topOpponentPenalty} 点): ` +
        discussion.detail.topOpponents.join(', '),
    );
  }
  for (const axis of axes) {
    if (axis.score < 50) reasons.push(`${axis.axis} 軸が ${axis.score} 点 (50 点未満)`);
  }
  return reasons;
}
