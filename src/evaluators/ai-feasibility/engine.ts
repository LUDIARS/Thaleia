// AI 実装可否軸のエンジン (I/O)。 仕様の具体性 (LLM)、 足場 (Anatomia spec-links + Augur テスト)、
// 過去実績 (Genius 判断カード) を集めて純粋層 (signals.ts) へ渡す。

import { extractJson } from '../../llm/claude.ts';
import { normalizeName } from '../../text/normalize.ts';
import { missingFrom } from '../axis.ts';
import { unconfigured, type EvaluationContext } from '../context.ts';
import { implementorsOf, missingFor, type ProjectFacts } from '../project-facts.ts';
import { geniusCardUrl } from '../../links/deeplink.ts';
import { scoreAiFeasibility, type PriorJudgment, type SpecificitySignals } from './signals.ts';
import type { AxisResult, Missing } from '../../initiative/types.ts';
import type { DomainTarget } from '../targets.ts';

export interface AiFeasibilityEngineInput {
  context: EvaluationContext;
  facts: ProjectFacts;
  targets: readonly DomainTarget[];
  missing: Missing[];
}

/** 「見送り/却下」を表す語。 判断カードの本文がこれを含むなら減点対象にする。 */
const NEGATIVE_JUDGMENT_WORDS = ['見送', '却下', 'やらない', '中止', '不採用', 'defer', 'reject'];

export async function evaluateAiFeasibility(input: AiFeasibilityEngineInput): Promise<AxisResult> {
  const { context, facts, targets } = input;
  const missing: Missing[] = [...input.missing, ...missingFor(facts, [
    'anatomia_domains_unavailable',
    'anatomia_domain_view_unavailable',
    'anatomia_graph_unavailable',
    'anatomia_spec_links_unavailable',
  ])];

  const llmOutput = await runSpecificity(context, missing);
  const specLinkDensity = computeSpecLinkDensity(facts, targets);
  if (specLinkDensity === null && facts.specLinks !== null) {
    missing.push({
      code: 'spec_link_density_unavailable',
      reason: '触るドメインの実装アンカーが解決できず spec-link 密度を出せない',
    });
  }
  const testQuotaFill = await loadTestQuotaFill(context, targets, missing);
  const priors = await loadPriors(context, missing);

  return scoreAiFeasibility({
    specificity: llmOutput?.specificity ?? null,
    specLinkDensity,
    testQuotaFill,
    priors,
    splitPlan: llmOutput?.splitPlan ?? [],
    missing,
  });
}

interface SpecificityOutput {
  specificity: SpecificitySignals;
  splitPlan: string[];
}

/** 仕様の具体性判定と「委託する場合の分割案」を LLM 1 回で出す。 */
async function runSpecificity(
  context: EvaluationContext,
  missing: Missing[],
): Promise<SpecificityOutput | null> {
  const { deps, initiative } = context;
  const prompt = [
    'あなたは実装委託の受け手です。 次の企画を AI に一発で実装させられるかを判定してください。',
    '3 つの観点をそれぞれ 0..1 で採点します: 受け入れ条件があるか / 画面遷移が書かれているか / データ項目が書かれているか。',
    'あわせて、 委託する場合の分割案を挙げてください。 分割は MVP を作らず、',
    '設計済み機能をフルセットで実装・配線・テストする単位にしてください。',
    '',
    '# 企画',
    `タイトル: ${initiative.title}`,
    `種別: ${initiative.kind}`,
    initiative.body.slice(0, 20_000),
    '',
    '# 出力',
    'JSON のみ。 説明文は書かないでください。',
    '{"acceptance":0,"screenFlow":0,"dataFields":0,"splitPlan":["...","..."]}',
  ].join('\n');

  try {
    const parsed = extractJson<{
      acceptance?: number;
      screenFlow?: number;
      dataFields?: number;
      splitPlan?: unknown;
    }>(await deps.llm(prompt));
    return {
      specificity: {
        acceptance: Number(parsed.acceptance ?? 0),
        screenFlow: Number(parsed.screenFlow ?? 0),
        dataFields: Number(parsed.dataFields ?? 0),
      },
      splitPlan: Array.isArray(parsed.splitPlan) ? parsed.splitPlan.map(String) : [],
    };
  } catch (e) {
    missing.push(missingFrom('llm_specificity_failed', e));
    return null;
  }
}

/**
 * 触るドメインの実装関数のうち、 spec-link を持つものの割合。
 * spec-links は関数 anchor 単位のことも、 ファイル単位のこともあるので両対応で数える。
 */
export function computeSpecLinkDensity(
  facts: ProjectFacts,
  targets: readonly DomainTarget[],
): number | null {
  if (facts.specLinks === null || !facts.graph) return null;
  const anchors = new Set<string>();
  for (const target of targets) {
    if (!target.matched) continue;
    for (const anchor of implementorsOf(facts, target.matched)) anchors.add(anchor);
  }
  if (anchors.size === 0) return null;

  const linkedFrom = new Set(facts.specLinks.map((link) => link.from));
  let linked = 0;
  for (const node of facts.graph.nodes) {
    if (!anchors.has(node.id)) continue;
    if (linkedFrom.has(node.id) || (node.path !== '' && linkedFrom.has(node.path))) linked += 1;
  }
  return linked / anchors.size;
}

/** Augur の per-domain quota 充足率。 repoPath が無ければ missing。 */
async function loadTestQuotaFill(
  context: EvaluationContext,
  targets: readonly DomainTarget[],
  missing: Missing[],
): Promise<number | null> {
  const { deps, initiative } = context;
  if (!deps.augur) {
    missing.push(unconfigured('augur', 'AUGUR_BIN'));
    return null;
  }
  if (!initiative.repoPath) {
    missing.push({
      code: 'augur_repo_path_missing',
      reason: '施策に repoPath が無いため Augur の登録テストを引けない',
    });
    return null;
  }
  try {
    const tests = await deps.augur.listTests({ repoPath: initiative.repoPath });
    const names = new Set(targets.map((t) => normalizeName(t.matched ?? t.raw)));
    const relevant = tests.filter((test) =>
      [...test.domains.business, ...test.domains.program].some((d) => names.has(normalizeName(d))),
    );
    // 触るドメイン 1 件につき active テスト 2 件を充足の目安に置く。
    const expected = Math.max(1, targets.length) * 2;
    return Math.max(0, Math.min(1, relevant.filter((t) => t.status === 'active').length / expected));
  } catch (e) {
    missing.push(missingFrom('augur_tests_unavailable', e));
    return null;
  }
}

/** Genius の判断カード。 「過去に見送った理由」が当たれば減点対象になる。 */
async function loadPriors(context: EvaluationContext, missing: Missing[]): Promise<PriorJudgment[]> {
  const { deps, initiative } = context;
  if (!deps.genius) {
    missing.push(unconfigured('genius', 'GENIUS_BASE_URL'));
    return [];
  }
  try {
    const cards = await deps.genius.query({
      text: `${initiative.title}\n${initiative.body.slice(0, 8000)}`,
      k: 8,
    });
    return cards.map((card) => ({
      cardId: card.id,
      situation: card.situation,
      judgment: card.judgment,
      score: card.score,
      negative: isNegativeJudgment(card.judgment) || isNegativeJudgment(card.rationale),
      url: geniusCardUrl(deps.config.geniusWebUrl, card.id),
    }));
  } catch (e) {
    missing.push(missingFrom('genius_query_unavailable', e));
    return [];
  }
}

/** 判断カードが「見送り/却下」寄りか。 */
export function isNegativeJudgment(text: string): boolean {
  const normalized = text.toLowerCase();
  return NEGATIVE_JUDGMENT_WORDS.some((word) => normalized.includes(word.toLowerCase()));
}
