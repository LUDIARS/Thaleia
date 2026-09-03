// UX 軸のエンジン (I/O)。 Anatomia のシーン/画面を集め、 LLM にルーブリック採点させ、
// Augur の体験制約と突き合わせてから純粋層 (rubric.ts) へ渡す。

import { extractJson } from '../../llm/claude.ts';
import { missingFrom } from '../axis.ts';
import { unconfigured, type EvaluationContext } from '../context.ts';
import { scoreUx, type ExperienceConflict, type UxRubricScores } from './rubric.ts';
import type { AxisResult, Missing } from '../../initiative/types.ts';

/** UX 軸の結果 (総合と Di 議論の種に使う「意図された体験」を添える)。 */
export interface UxAxisOutcome {
  axis: AxisResult;
  /** LLM が抽出した意図された体験。 Di へ議論を起票するときの description に使う。 */
  intendedAffect: string | null;
}

export async function evaluateUx(context: EvaluationContext): Promise<UxAxisOutcome> {
  const missing: Missing[] = [];

  const surfaces = await loadSurfaces(context, missing);
  const llmResult = await runRubric(context, surfaces, missing);
  const conflicts = llmResult?.conflicts ?? [];

  const axis = scoreUx({
    scores: llmResult?.scores ?? null,
    intendedAffect: llmResult?.intendedAffect ?? null,
    knownSurfaces: surfaces.length,
    conflicts,
    missing,
  });
  return { axis, intendedAffect: llmResult?.intendedAffect ?? null };
}

/** 既存シーン + 画面の名前。 UX の「既存整合」を採点する足場。 */
async function loadSurfaces(context: EvaluationContext, missing: Missing[]): Promise<string[]> {
  const { deps, initiative } = context;
  if (!deps.anatomia) {
    missing.push(unconfigured('anatomia', 'ANATOMIA_BASE_URL'));
    return [];
  }
  const names: string[] = [];
  try {
    names.push(...(await deps.anatomia.listScreens(initiative.project)).map((s) => s.name));
  } catch (e) {
    missing.push(missingFrom('anatomia_screens_unavailable', e));
  }
  try {
    names.push(...(await deps.anatomia.listScenes(initiative.project)).map((s) => s.name));
  } catch (e) {
    missing.push(missingFrom('anatomia_scenes_unavailable', e));
  }
  return [...new Set(names)];
}

interface RubricOutput {
  scores: UxRubricScores;
  intendedAffect: string | null;
  conflicts: ExperienceConflict[];
}

/** ルーブリック採点 + 意図された体験の抽出 + 体験制約との矛盾検出を LLM 1 回で行う。 */
async function runRubric(
  context: EvaluationContext,
  surfaces: readonly string[],
  missing: Missing[],
): Promise<RubricOutput | null> {
  const { deps, initiative } = context;
  const constraints = await loadExperienceConstraints(context, missing);
  const prompt = [
    'あなたは UX レビュアーです。 次の企画を 4 観点で 0..100 点で採点してください。',
    '観点: 導線の一貫性 / 学習コスト (低いほど高得点) / 既存 UX との整合 / 体験の意図が言語化されているか。',
    'あわせて「意図された体験 (intended affect)」を 1〜2 文で抽出し、',
    '体験の予算 (応答時間などの制約) と企画が矛盾する場合はその矛盾を挙げてください。',
    '',
    `# 既存のシーン/画面 (${surfaces.length} 件)`,
    surfaces.length > 0 ? surfaces.slice(0, 200).join(', ') : '(未取得)',
    '',
    '# 体験の制約 (Augur が要求した検査)',
    constraints.length > 0 ? constraints.join('\n') : '(なし)',
    '',
    '# 企画',
    `タイトル: ${initiative.title}`,
    `種別: ${initiative.kind}`,
    initiative.body.slice(0, 20_000),
    '',
    '# 出力',
    'JSON のみ。 説明文は書かないでください。',
    '{"flowConsistency":0,"learningCost":0,"existingFit":0,"intentClarity":0,',
    ' "intendedAffect":"...","conflicts":[{"constraint":"...","detail":"..."}]}',
  ].join('\n');

  try {
    const parsed = extractJson<{
      flowConsistency?: number;
      learningCost?: number;
      existingFit?: number;
      intentClarity?: number;
      intendedAffect?: string;
      conflicts?: Array<{ constraint?: string; detail?: string }>;
    }>(await deps.llm(prompt));
    return {
      scores: {
        flowConsistency: Number(parsed.flowConsistency ?? 0),
        learningCost: Number(parsed.learningCost ?? 0),
        existingFit: Number(parsed.existingFit ?? 0),
        intentClarity: Number(parsed.intentClarity ?? 0),
      },
      intendedAffect: typeof parsed.intendedAffect === 'string' ? parsed.intendedAffect : null,
      conflicts: (parsed.conflicts ?? [])
        .map((c) => ({ constraint: String(c.constraint ?? ''), detail: String(c.detail ?? '') }))
        .filter((c) => c.constraint !== ''),
    };
  } catch (e) {
    missing.push(missingFrom('llm_ux_rubric_failed', e));
    return null;
  }
}

/**
 * Augur の experience-driven constraints。 現状 Augur は「この変更に要る検査」として返すので、
 * 体験に効く検査 (runtime を伴うもの) を制約として LLM に渡す。 repoPath 未指定なら missing。
 */
async function loadExperienceConstraints(
  context: EvaluationContext,
  missing: Missing[],
): Promise<string[]> {
  const { deps, initiative } = context;
  if (!deps.augur) {
    missing.push(unconfigured('augur', 'AUGUR_BIN'));
    return [];
  }
  if (!initiative.repoPath) {
    missing.push({
      code: 'augur_repo_path_missing',
      reason: '施策に repoPath が無いため Augur の体験制約を引けない',
    });
    return [];
  }
  try {
    const plan = await deps.augur.reviewPlan({
      repoPath: initiative.repoPath,
      title: initiative.title,
      changeProfile: {
        kinds: ['code'],
        changedFiles: 1,
        changedLines: 1,
        docsOnly: false,
        touchesSpec: true,
        runtimeSurfaces: ['ui'],
      },
    });
    return plan.stages.filter((s) => s.run).map((s) => `${s.id}: ${s.reason}`);
  } catch (e) {
    missing.push(missingFrom('augur_review_plan_unavailable', e));
    return [];
  }
}
