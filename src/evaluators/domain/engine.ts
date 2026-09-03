// ドメイン解析軸のエンジン (I/O)。 二層 (業務/プログラム) の整合と返済状況を組み、
// improvement のときは同じ素材からデグレード判定 (§4.6) を派生させる。

import { normalizeName } from '../../text/normalize.ts';
import { missingFrom } from '../axis.ts';
import { unconfigured, type EvaluationContext } from '../context.ts';
import {
  domainFanIn,
  fanInReference,
  implementorsOf,
  missingFor,
  type ProjectFacts,
} from '../project-facts.ts';
import { scoreDomain, summarizeConsistency, type DomainLayerStatus } from './consistency.ts';
import { assessDegradeRisk } from './degrade-risk.ts';
import type { AxisResult, DegradeRiskResult, Missing } from '../../initiative/types.ts';
import type { DomainTarget } from '../targets.ts';

export interface DomainAxisOutcome {
  axis: AxisResult;
  /** improvement のときだけ出す。 new-content では null。 */
  degrade: DegradeRiskResult | null;
  /** 触るドメインの二層状態 (ビューアが内訳を出す)。 */
  statuses: DomainLayerStatus[];
}

export interface DomainEngineInput {
  context: EvaluationContext;
  facts: ProjectFacts;
  targets: readonly DomainTarget[];
  missing: Missing[];
}

export async function evaluateDomain(input: DomainEngineInput): Promise<DomainAxisOutcome> {
  const statuses = buildLayerStatuses(input.facts, input.targets);
  const axis = scoreDomain({
    statuses,
    // 新規ドメインが要るのに業務ドメイン側に空きが無い、 といった衝突はゲート試算を要する。
    // ゲート API は POST (提案生成) なので評価では叩かず、 検出済みの不整合だけを使う。
    organizationConflicts: [],
    missing: [...input.missing, ...missingFor(input.facts, [
      'anatomia_domains_unavailable',
      'anatomia_domain_view_unavailable',
      'anatomia_graph_unavailable',
      'anatomia_entrypoint_graph_unavailable',
      'anatomia_hotspots_unavailable',
      'anatomia_business_domain_view_unavailable',
      'anatomia_program_domain_view_unavailable',
    ])],
  });

  const degrade =
    input.context.initiative.kind === 'improvement'
      ? await assessDegrade(input, statuses)
      : null;

  return { axis, degrade, statuses };
}

/** 触るドメインごとに二層の在り処を突き合わせる。 */
export function buildLayerStatuses(
  facts: ProjectFacts,
  targets: readonly DomainTarget[],
): DomainLayerStatus[] {
  const businessByName = new Map(
    (facts.businessDomains ?? []).map((d) => [normalizeName(d.name), d]),
  );
  const programById = new Map(
    (facts.programDomainView?.domains ?? []).map((d) => [normalizeName(d.id), d]),
  );
  const proposalsByTarget = groupProposals(facts);

  return targets.map((target) => {
    const name = target.matched ?? target.raw;
    const key = normalizeName(name);
    const business = businessByName.get(key) ?? null;
    const program = programById.get(key) ?? null;
    // 対象の業務↔プログラムドメイン同士が直接参照されている場合だけ整合とみなす。
    // 他ドメインへの有効な参照は、この対象ペアの整合を証明しない。
    const linked = business !== null && program !== null && (
      business.programDomains.some((p) => normalizeName(p.programDomainId) === normalizeName(program.id)) ||
      program.businessDomains.some((b) => normalizeName(b.businessDomainId) === normalizeName(business.id))
    );

    return {
      domain: name,
      inBusinessLayer: business !== null,
      inProgramLayer: program !== null || (target.matched !== null && implementorsOf(facts, name).size > 0),
      linked,
      misfitCount: program?.misfitCount ?? 0,
      openProposals: proposalsByTarget.get(key) ?? [],
    };
  });
}

/** refactoring 提案を対象ドメイン名で引けるようにする。 */
function groupProposals(
  facts: ProjectFacts,
): Map<string, Array<{ proposalId: string; rule: string; action: string }>> {
  const grouped = new Map<string, Array<{ proposalId: string; rule: string; action: string }>>();
  for (const proposal of facts.programDomainView?.proposals ?? []) {
    if (proposal.taskStatus === 'done') continue;
    for (const target of proposal.targets) {
      const key = normalizeName(target);
      const list = grouped.get(key) ?? [];
      list.push({ proposalId: proposal.proposalId, rule: proposal.rule, action: proposal.action });
      grouped.set(key, list);
    }
  }
  return grouped;
}

/** improvement のデグレード危険度。 Augur の要求検査と登録テストを引いて組む。 */
async function assessDegrade(
  input: DomainEngineInput,
  statuses: readonly DomainLayerStatus[],
): Promise<DegradeRiskResult> {
  const { context, facts, targets } = input;
  const { deps, initiative } = context;
  const missing: Missing[] = [];

  const maxFanIn = Math.max(
    0,
    ...targets.filter((t) => t.matched).map((t) => domainFanIn(facts, t.matched as string)),
  );
  const hotspotHits = countHotspotHits(facts, targets);
  const summary = summarizeConsistency(statuses);

  let requiredChecks: string[] = [];
  let registeredTests = 0;
  let regressionCoverage: number | null = null;

  if (!deps.augur) {
    missing.push(unconfigured('augur', 'AUGUR_BIN'));
  } else if (!initiative.repoPath) {
    missing.push({
      code: 'augur_repo_path_missing',
      reason: '施策に repoPath が無いため Augur の回帰テスト状況を引けない',
    });
  } else {
    try {
      const plan = await deps.augur.reviewPlan({
        repoPath: initiative.repoPath,
        title: initiative.title,
        changeProfile: {
          kinds: ['code'],
          changedFiles: Math.max(1, targets.length),
          changedLines: 1,
          docsOnly: false,
          touchesSpec: true,
          runtimeSurfaces: ['entrypoint'],
        },
      });
      requiredChecks = plan.stages.filter((s) => s.run).map((s) => s.id);
    } catch (e) {
      missing.push(missingFrom('augur_review_plan_unavailable', e));
    }
    try {
      const tests = await deps.augur.listTests({ repoPath: initiative.repoPath });
      const names = new Set(targets.map((t) => normalizeName(t.matched ?? t.raw)));
      const relevant = tests.filter((test) => test.status === 'active' &&
        [...test.domains.business, ...test.domains.program].some((d) => names.has(normalizeName(d))),
      );
      registeredTests = relevant.length;
      regressionCoverage = coverageFrom(relevant.length, targets.length);
    } catch (e) {
      missing.push(missingFrom('augur_tests_unavailable', e));
    }
  }

  return assessDegradeRisk({
    maxFanIn,
    fanInReference: fanInReference(facts),
    hotspotHits,
    hotspotTotal: (facts.hotspots ?? []).length,
    regressionCoverage,
    layerMismatchRatio: summary.mismatchRatio,
    requiredChecks,
    registeredTests,
    openProposals: statuses.flatMap((s) =>
      s.openProposals.map((p) => ({ domain: s.domain, rule: p.rule, action: p.action })),
    ),
    missing,
  });
}

/** 触るドメインの実装が hotspot に何件当たるか。 */
function countHotspotHits(facts: ProjectFacts, targets: readonly DomainTarget[]): number {
  const hotspots = facts.hotspots ?? [];
  if (hotspots.length === 0) return 0;
  const anchors = new Set<string>();
  const paths = new Set<string>();
  for (const target of targets) {
    if (!target.matched) continue;
    for (const anchor of implementorsOf(facts, target.matched)) anchors.add(anchor);
  }
  for (const node of facts.graph?.nodes ?? []) {
    if (anchors.has(node.id) && node.path) paths.add(node.path);
  }
  return hotspots.filter((h) => anchors.has(h.id) || (h.path !== '' && paths.has(h.path))).length;
}

/**
 * 回帰テスト充足率。 触るドメイン 1 件につき 2 件を「充分」とみなす。
 * (Augur の per-domain quota は既定 max がドメインごとに違うので、 施策側では最小限の目安を使う)
 */
function coverageFrom(testCount: number, domainCount: number): number {
  const expected = Math.max(1, domainCount) * 2;
  return Math.max(0, Math.min(1, testCount / expected));
}
