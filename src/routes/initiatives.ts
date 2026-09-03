// /api/initiatives — 施策の登録・取得・評価。 Thaleia の本体 API (設計 §3, §5)。
//
//   POST /api/initiatives            施策を登録する
//   GET  /api/initiatives            施策一覧 (verdict / total の推移)
//   GET  /api/initiatives/:id        最新評価 + 前回比 diff
//   POST /api/initiatives/:id/evaluate  評価を 1 回走らせて保存する
//   GET  /api/config                 ディープリンク先と上流の設定有無 (ビューア用)

import type { Hono } from 'hono';
import { CONFIDENCE_HOLD_THRESHOLD } from '../aggregate/confidence.ts';
import { makeAnatomiaClient } from '../clients/anatomia.ts';
import { makeAugurClient } from '../clients/augur.ts';
import { makeDiscutereClient } from '../clients/discutere.ts';
import { makeGeniusClient } from '../clients/genius.ts';
import { makeLudusClient } from '../clients/ludus.ts';
import { runEvaluation } from '../evaluators/pipeline.ts';
import { makeClaudeRunner } from '../llm/claude.ts';
import type { EvaluatorDeps } from '../evaluators/context.ts';
import type { InitiativeStore } from '../initiative/store.ts';
import type { AxisId, Evaluation, EvaluationDiff, InitiativeInput } from '../initiative/types.ts';
import { AXIS_IDS } from '../initiative/types.ts';
import type { ThaleiaConfig } from '../config.ts';

export function mountInitiativeRoutes(
  app: Hono,
  config: ThaleiaConfig,
  store: InitiativeStore,
  dataDir: string,
): void {
  app.get('/api/config', (c) =>
    c.json({
      anatomia: Boolean(config.anatomiaBaseUrl),
      discutere: Boolean(config.discutereBaseUrl),
      augur: Boolean(config.augurBin),
      genius: Boolean(config.geniusBaseUrl),
      ludus: Boolean(config.ludusRepoDir),
      praeforma: Boolean(config.praeformaBaseUrl),
      weights: config.weights,
      deferThreshold: config.deferThreshold,
      confidenceHoldThreshold: CONFIDENCE_HOLD_THRESHOLD,
    }),
  );

  app.post('/api/initiatives', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json', hint: 'JSON 本文を送ってください' }, 400);
    }
    const parsed = parseInitiativeInput(body);
    if ('error' in parsed) return c.json({ error: 'invalid_input', hint: parsed.error }, 400);

    const initiative = await store.create(parsed.value, new Date().toISOString());
    return c.json(initiative, 201);
  });

  app.get('/api/initiatives', async (c) => c.json({ items: await store.list() }));

  app.get('/api/initiatives/:id', async (c) => {
    const id = c.req.param('id');
    const initiative = await store.get(id);
    if (!initiative) return c.json({ error: 'initiative_not_found', id }, 404);

    const [latest, previous, history] = await Promise.all([
      store.latestEvaluation(id),
      store.previousEvaluation(id),
      store.evaluationHistory(id),
    ]);
    return c.json({
      initiative,
      evaluation: latest,
      diff: diffEvaluations(previous, latest),
      history: history.map((run) => ({
        evaluatedAt: run.evaluatedAt,
        total: run.total,
        verdict: run.verdict,
        confidence: run.confidence,
      })),
    });
  });

  app.post('/api/initiatives/:id/evaluate', async (c) => {
    const id = c.req.param('id');
    const initiative = await store.get(id);
    if (!initiative) return c.json({ error: 'initiative_not_found', id }, 404);

    const previous = await store.latestEvaluation(id);
    let evaluation: Evaluation;
    try {
      evaluation = await runEvaluation(
        { deps: makeDeps(config, dataDir), initiative },
        new Date().toISOString(),
      );
    } catch {
      // 上流の個別失敗は missing に落ちるので、 ここへ来るのは Thaleia 側の不具合。
      return c.json({ error: 'evaluation_failed' }, 500);
    }
    await store.saveEvaluation(evaluation);
    return c.json({ evaluation, diff: diffEvaluations(previous, evaluation) });
  });
}

/** 設定済みの上流だけ client を作る。 未設定は null のまま渡し、 各軸が missing にする。 */
export function makeDeps(config: ThaleiaConfig, dataDir: string): EvaluatorDeps {
  return {
    config,
    anatomia: config.anatomiaBaseUrl ? makeAnatomiaClient({ baseUrl: config.anatomiaBaseUrl }) : null,
    discutere: config.discutereBaseUrl
      ? makeDiscutereClient({ baseUrl: config.discutereBaseUrl, userId: config.discutereUserId })
      : null,
    augur: config.augurBin ? makeAugurClient({ bin: config.augurBin }) : null,
    genius: config.geniusBaseUrl ? makeGeniusClient({ baseUrl: config.geniusBaseUrl }) : null,
    ludus: config.ludusRepoDir ? makeLudusClient({ repoDir: config.ludusRepoDir }) : null,
    llm: makeClaudeRunner(config.claudeBin, config.claudeModel, config.claudeTimeoutMs),
    dataDir,
  };
}

/** POST 本文を検証する。 足りないものは黙って埋めずエラーにする。 */
export function parseInitiativeInput(body: unknown): { value: InitiativeInput } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: '本文は JSON オブジェクトです' };
  const raw = body as Record<string, unknown>;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title === '') return { error: 'title は必須です' };

  const kind = raw.kind;
  if (kind !== 'new-content' && kind !== 'improvement') {
    return { error: 'kind は new-content か improvement です' };
  }

  const project = typeof raw.project === 'string' ? raw.project.trim() : '';
  // project 未指定でもドメイン解析軸を skip はしない (設計 §3)。 入力の時点で弾く。
  if (project === '') return { error: 'project (Anatomia の project id) は必須です' };

  const initiativeBody = typeof raw.body === 'string' ? raw.body : '';
  if (initiativeBody.trim() === '') return { error: 'body (企画本文) は必須です' };

  const discutere = raw.discutere as { gapId?: unknown } | undefined | null;
  const ludus = raw.ludus as { gameId?: unknown } | undefined | null;

  return {
    value: {
      title,
      kind,
      project,
      body: initiativeBody,
      discutere: discutere?.gapId ? { gapId: String(discutere.gapId) } : null,
      ludus: ludus?.gameId ? { gameId: String(ludus.gameId) } : null,
      repoPath: typeof raw.repoPath === 'string' && raw.repoPath.trim() !== '' ? raw.repoPath.trim() : null,
    },
  };
}

/** 前回比。 前回が無ければ delta を null にして「初回」と分かるようにする。 */
export function diffEvaluations(
  previous: Evaluation | null,
  latest: Evaluation | null,
): EvaluationDiff | null {
  if (!latest) return null;
  if (!previous) {
    return { previousAt: null, totalDelta: null, verdictChanged: false, axisDeltas: [] };
  }
  const previousByAxis = new Map<AxisId, number>(previous.axes.map((a) => [a.axis, a.score]));
  return {
    previousAt: previous.evaluatedAt,
    totalDelta: round1(latest.total - previous.total),
    verdictChanged: previous.verdict !== latest.verdict,
    axisDeltas: AXIS_IDS.map((axis) => ({
      axis,
      delta: round1((latest.axes.find((a) => a.axis === axis)?.score ?? 0) - (previousByAxis.get(axis) ?? 0)),
    })),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
