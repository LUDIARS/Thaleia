// Di 議論軸のエンジン (I/O)。 設計 §4.5。
//
//   (a) gapId があればその議論を読む。 無ければ Thaleia が Di へ design_gap を起票する (§8-6 A 案)
//   (b) 各ペルソナの発話を LLM で 2 軸 (実現性 / 体験価値) へ写像する
//   (c) 内部スコアと単独合否は純粋層 (persona-score.ts) が決める
//
// ペルソナ閾値の上書きは data/personas/<personaId>.json の { "threshold": 0..100 } を読む。

import { join } from 'node:path';
import { DEFAULT_PERSONA_WEIGHTS } from '../../config.ts';
import { discutereGapUrl } from '../../links/deeplink.ts';
import { extractJson } from '../../llm/claude.ts';
import { readJson } from '../../store/json-file.ts';
import { makeAxisResult, missingFrom } from '../axis.ts';
import { unconfigured, type EvaluationContext } from '../context.ts';
import { scorePersonas, type PersonaScoreInput } from './persona-score.ts';
import type { DiscuterePersonaConsensus } from '../../clients/discutere.ts';
import type { AxisResult, DiscussionDetail, Evidence, Missing } from '../../initiative/types.ts';

export interface DiscussionAxisOutcome {
  axis: AxisResult;
  /** 四象限の可視化に使う内訳。 議論が取れなければ null。 */
  detail: DiscussionDetail | null;
  /** 全ペルソナの方向を判定でき、過半判定を verdict に使えるか。 */
  hasCompleteMapping: boolean;
}

export interface DiscussionEngineInput {
  context: EvaluationContext;
  /** UX 軸が抽出した「意図された体験」。 議論を起票するときの description に使う。 */
  intendedAffect: string | null;
}

export async function evaluateDiscussion(input: DiscussionEngineInput): Promise<DiscussionAxisOutcome> {
  const { context } = input;
  const { deps, initiative } = context;
  const missing: Missing[] = [];
  const evidence: Evidence[] = [];

  if (!deps.discutere) {
    missing.push(unconfigured('discutere', 'DISCUTERE_BASE_URL'));
    return { axis: emptyAxis(missing, evidence), detail: null, hasCompleteMapping: false };
  }

  const gapId = await resolveGapId(input, missing);
  if (!gapId) return { axis: emptyAxis(missing, evidence), detail: null, hasCompleteMapping: false };

  let personas: DiscuterePersonaConsensus[];
  try {
    personas = await deps.discutere.getPersonaConsensus(gapId);
  } catch (e) {
    missing.push(missingFrom('discutere_persona_consensus_unavailable', e));
    // 起票自体は成功している。 gapId を結果に残さないと呼び出し側が施策へ永続化できず、
    // 次回評価のたびに別の空 gap を作ってしまう。
    return {
      axis: emptyAxis(missing, evidence),
      detail: emptyDiscussionDetail(gapId),
      hasCompleteMapping: false,
    };
  }

  if (personas.length === 0) {
    missing.push({
      code: 'discutere_no_personas',
      reason: `gap ${gapId} の議論にペルソナの発話がまだ無い`,
    });
    return {
      axis: emptyAxis(missing, evidence),
      detail: emptyDiscussionDetail(gapId),
      hasCompleteMapping: false,
    };
  }

  const mapping = await mapPersonasToQuadrants(context, personas, missing);
  const overrides = await loadThresholdOverrides(deps.dataDir, personas.map((p) => p.personaId), missing);

  const inputs: PersonaScoreInput[] = personas.flatMap((persona): PersonaScoreInput[] => {
    const mapped = mapping.get(persona.personaId);
    // 2 軸を取得できないペルソナを境界値 (0, 0) で捏造すると象限 I の票になる。
    // 中立値も「方向を判定できない」という LLM の明示なので、象限投票から除外する。
    if (!mapped || (mapped.feasibility === 0 && mapped.experienceValue === 0)) return [];
    return [{
      personaId: persona.personaId,
      displayName: persona.displayName,
      traits: persona.traits,
      opinionScore: persona.opinionScore,
      consensusScore: persona.consensusScore,
      traitFit: mapped.traitFit,
      feasibility: mapped.feasibility,
      experienceValue: mapped.experienceValue,
      thresholdOverride: overrides.get(persona.personaId) ?? null,
      utterances: persona.utterances.map((u) => ({
        id: u.id,
        content: u.content,
        agree: u.agree,
        score: u.score,
      })),
    }];
  });

  const unmappedCount = personas.length - inputs.length;
  if (unmappedCount > 0) {
    missing.push({
      code: 'llm_persona_mapping_incomplete',
      reason: `${unmappedCount} 人のペルソナは 2 軸の方向を判定できなかったため象限集計から除外した`,
    });
  }

  const result = scorePersonas(inputs, DEFAULT_PERSONA_WEIGHTS);
  const hasCompleteMapping = unmappedCount === 0;
  const majorityBonus = hasCompleteMapping ? result.majorityBonus : 0;
  const score = Math.max(0, result.score - result.majorityBonus + majorityBonus);
  const gapUrl = discutereGapUrl(deps.config.discutereWebUrl, gapId);

  evidence.push({
    source: 'discutere',
    label: `ペルソナ ${result.personas.length} 人中 ${result.personas.filter((p) => p.pass).length} 人が単独で合格`,
    detail:
      `象限 I ${result.quadrantCounts.I} / II ${result.quadrantCounts.II} / ` +
      `III ${result.quadrantCounts.III} / IV ${result.quadrantCounts.IV}`,
    url: gapUrl,
  });
  if (majorityBonus > 0) {
    evidence.push({
      source: 'thaleia',
      label: `象限 I が過半のため +${majorityBonus} 点`,
      url: gapUrl,
    });
  }
  if (result.topOpponentPenalty > 0) {
    evidence.push({
      source: 'thaleia',
      label: `内部スコア上位が象限 IV にいるため −${result.topOpponentPenalty} 点`,
      detail: `反対している重要ペルソナ: ${result.topOpponents.join(', ')}`,
      url: gapUrl,
    });
  }
  if (initiative.discutere?.gapId !== gapId) {
    evidence.push({
      source: 'thaleia',
      label: 'この評価のために議論を起票した',
      detail: `gapId=${gapId}`,
      url: gapUrl,
    });
  }

  return {
    axis: makeAxisResult({
      axis: 'discussion',
      score,
      // 入力は 2 本 (Di のペルソナ集計 / LLM の 2 軸写像)。
      signals: 2,
      evidence,
      missing,
    }),
    detail: {
      gapId,
      personas: result.personas,
      quadrantCounts: result.quadrantCounts,
      majorityBonus,
      topOpponentPenalty: result.topOpponentPenalty,
      topOpponents: result.topOpponents,
    },
    hasCompleteMapping,
  };
}

/** 議論が無ければ 0 点ではなく中立点で返す (上流欠損は confidence 側で効かせる)。 */
function emptyAxis(missing: Missing[], evidence: Evidence[]): AxisResult {
  return makeAxisResult({ axis: 'discussion', score: 50, signals: 2, evidence, missing });
}

function emptyDiscussionDetail(gapId: string): DiscussionDetail {
  return {
    gapId,
    personas: [],
    quadrantCounts: { I: 0, II: 0, III: 0, IV: 0 },
    majorityBonus: 0,
    topOpponentPenalty: 0,
    topOpponents: [],
  };
}

/** gapId を決める。 未指定なら Di へ design_gap を起票する (§8-6 A 案)。 */
async function resolveGapId(input: DiscussionEngineInput, missing: Missing[]): Promise<string | null> {
  const { context, intendedAffect } = input;
  const { deps, initiative } = context;
  const existing = initiative.discutere?.gapId?.trim();
  if (existing) return existing;
  if (!deps.discutere) return null;

  const description = [
    intendedAffect ? `意図された体験: ${intendedAffect}` : null,
    initiative.body.slice(0, 4000),
  ]
    .filter((line): line is string => line !== null)
    .join('\n\n');

  try {
    const created = await deps.discutere.createGap({
      title: initiative.title,
      description,
      gameId: initiative.ludus?.gameId ?? null,
    });
    return created.gapId;
  } catch (e) {
    missing.push(missingFrom('discutere_gap_creation_failed', e));
    return null;
  }
}

interface PersonaMapping {
  feasibility: number;
  experienceValue: number;
  traitFit: number;
}

/** 全ペルソナの 2 軸写像と trait 相性を LLM 1 回で出す (§4.5(b)(c))。 */
async function mapPersonasToQuadrants(
  context: EvaluationContext,
  personas: readonly DiscuterePersonaConsensus[],
  missing: Missing[],
): Promise<Map<string, PersonaMapping>> {
  const { deps, initiative } = context;
  const digest = personas.map((persona) => ({
    personaId: persona.personaId,
    displayName: persona.displayName,
    traits: persona.traits,
    utterances: persona.utterances.slice(0, 12).map((u) => u.content.slice(0, 400)),
  }));

  const prompt = [
    'あなたは議論の分析者です。 各ペルソナの発話を 2 つの軸へ写像してください。',
    'feasibility (実現性): そのペルソナが「作れる / 壊れない」と見ているか。 -1..+1。',
    'experienceValue (体験価値): そのペルソナが「面白い / 意図した体験になる」と見ているか。 -1..+1。',
    'traitFit: そのペルソナの traits とこの施策の種別との相性。 0..1。',
    '発話が判断材料に乏しいときは 0 (中立) を返してください。',
    '',
    '# 施策',
    `タイトル: ${initiative.title}`,
    `種別: ${initiative.kind}`,
    initiative.body.slice(0, 8000),
    '',
    '# ペルソナと発話',
    JSON.stringify(digest).slice(0, 40_000),
    '',
    '# 出力',
    'JSON のみ。 説明文は書かないでください。',
    '{"personas":[{"personaId":"...","feasibility":0,"experienceValue":0,"traitFit":0.5}]}',
  ].join('\n');

  const mapping = new Map<string, PersonaMapping>();
  try {
    const parsed = extractJson<{
      personas?: Array<{
        personaId?: string;
        feasibility?: number;
        experienceValue?: number;
        traitFit?: number;
      }>;
    }>(await deps.llm(prompt));
    const expectedIds = new Set(personas.map((persona) => persona.personaId));
    for (const row of parsed.personas ?? []) {
      const personaId = typeof row.personaId === 'string' ? row.personaId : '';
      if (!expectedIds.has(personaId)) continue;
      if (
        typeof row.feasibility !== 'number' || !Number.isFinite(row.feasibility) ||
        typeof row.experienceValue !== 'number' || !Number.isFinite(row.experienceValue) ||
        typeof row.traitFit !== 'number' || !Number.isFinite(row.traitFit)
      ) continue;
      mapping.set(personaId, {
        feasibility: row.feasibility,
        experienceValue: row.experienceValue,
        traitFit: row.traitFit,
      });
    }
  } catch (e) {
    missing.push(missingFrom('llm_persona_mapping_failed', e));
  }
  return mapping;
}

/**
 * data/personas/<id>.json の threshold を読む (無ければ traits から初期化される)。
 *
 * この上書きは人が書くファイルなので壊れていることがある。 読めない 1 件で評価全体を
 * 落とすと「上流が欠けても軸は missing にする」原則を破るので、 欠損として記録して
 * traits 由来の初期値へ戻す (黙って無視はしない)。
 */
async function loadThresholdOverrides(
  dataDir: string,
  personaIds: readonly string[],
  missing: Missing[],
): Promise<Map<string, number>> {
  const overrides = new Map<string, number>();
  for (const personaId of personaIds) {
    // personaId はファイル名に使うので、安全な単一セグメントだけを読む。
    if (!/^[a-zA-Z0-9._-]+$/.test(personaId)) continue;
    let parsed: { threshold?: unknown } | null;
    try {
      parsed = await readJson<{ threshold?: unknown }>(join(dataDir, 'personas', `${personaId}.json`));
    } catch {
      // 例外本文はローカルパスを含み得るので載せない (persona id だけで場所は分かる)。
      missing.push({
        code: 'persona_threshold_override_unreadable',
        reason: `data/personas/${personaId}.json を読めないため閾値の上書きを適用しなかった`,
      });
      continue;
    }
    const threshold = Number(parsed?.threshold);
    if (Number.isFinite(threshold) && threshold >= 0 && threshold <= 100) {
      overrides.set(personaId, threshold);
    }
  }
  return overrides;
}
