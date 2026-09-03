// 施策と評価の永続化。
//
//   data/initiatives/<id>.json                 施策そのもの
//   data/initiatives/<id>/evaluations/<ts>.json 評価 1 回分 (新しい順に積む)
//
// 前回比 diff は evaluations の 2 件目を読んで出す (旧 store の history 機構をそのまま転用)。

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { listJsonFiles, readJson, slug, stampToFile, writeJson } from '../store/json-file.ts';
import type { Evaluation, Initiative, InitiativeInput } from './types.ts';

/** 一覧表示用の軽量サマリ。 */
export interface InitiativeSummary {
  id: string;
  title: string;
  kind: Initiative['kind'];
  project: string;
  updatedAt: string;
  /** 最新評価 (未評価なら null)。 */
  latest: { evaluatedAt: string; total: number; verdict: Evaluation['verdict']; confidence: number } | null;
  /** total の推移 (古い順、 最大 20 点)。 */
  history: Array<{ evaluatedAt: string; total: number; verdict: Evaluation['verdict'] }>;
}

export interface InitiativeStore {
  create(input: InitiativeInput, now: string): Promise<Initiative>;
  get(id: string): Promise<Initiative | null>;
  list(): Promise<InitiativeSummary[]>;
  saveEvaluation(evaluation: Evaluation): Promise<string>;
  /** 最新評価。 未評価なら null。 */
  latestEvaluation(id: string): Promise<Evaluation | null>;
  /** 直前の評価 (最新の 1 つ前)。 無ければ null。 */
  previousEvaluation(id: string): Promise<Evaluation | null>;
  /** 評価の推移 (古い順)。 */
  evaluationHistory(id: string, max?: number): Promise<Evaluation[]>;
}

const HISTORY_POINTS = 20;

export function makeInitiativeStore(dataDir: string): InitiativeStore {
  const root = join(dataDir, 'initiatives');
  const fileFor = (id: string) => join(root, `${assertInitiativeId(id)}.json`);
  const evaluationsDir = (id: string) => join(root, assertInitiativeId(id), 'evaluations');

  async function evaluations(id: string): Promise<Evaluation[]> {
    const files = await listJsonFiles(evaluationsDir(id));
    const out: Evaluation[] = [];
    for (const file of files) {
      const parsed = await readJson<Evaluation>(file);
      if (parsed) out.push(parsed);
    }
    return out; // 新しい順
  }

  return {
    async create(input, now) {
      const initiative: Initiative = {
        ...input,
        id: makeInitiativeId(input.title, now, randomUUID()),
        createdAt: now,
        updatedAt: now,
      };
      await writeJson(fileFor(initiative.id), initiative);
      return initiative;
    },

    get(id) {
      if (!isInitiativeId(id)) return Promise.resolve(null);
      return readJson<Initiative>(fileFor(id));
    },

    async list() {
      const files = await listJsonFiles(root);
      const summaries: InitiativeSummary[] = [];
      for (const file of files) {
        const initiative = await readJson<Initiative>(file);
        if (!initiative?.id || !isInitiativeId(initiative.id)) continue;
        const runs = await evaluations(initiative.id);
        const latest = runs[0] ?? null;
        summaries.push({
          id: initiative.id,
          title: initiative.title,
          kind: initiative.kind,
          project: initiative.project,
          updatedAt: initiative.updatedAt,
          latest: latest
            ? {
                evaluatedAt: latest.evaluatedAt,
                total: latest.total,
                verdict: latest.verdict,
                confidence: latest.confidence,
              }
            : null,
          history: runs
            .slice(0, HISTORY_POINTS)
            .reverse()
            .map((r) => ({ evaluatedAt: r.evaluatedAt, total: r.total, verdict: r.verdict })),
        });
      }
      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async saveEvaluation(evaluation) {
      const file = join(
        evaluationsDir(evaluation.initiativeId),
        `${stampToFile(evaluation.evaluatedAt)}-${randomUUID().replace(/-/g, '').slice(0, 12)}.json`,
      );
      await writeJson(file, evaluation);
      const initiative = await readJson<Initiative>(fileFor(evaluation.initiativeId));
      if (initiative) {
        const evaluatedGapId = evaluation.discussion?.gapId?.trim() || null;
        const existingGapId = initiative.discutere?.gapId?.trim() || null;
        await writeJson(fileFor(evaluation.initiativeId), {
          ...initiative,
          // 自動起票した Di gap を施策へ戻し、再評価で同じ議論を継続する。
          discutere: existingGapId || !evaluatedGapId ? initiative.discutere : { gapId: evaluatedGapId },
          updatedAt: evaluation.evaluatedAt,
        });
      }
      return file;
    },

    async latestEvaluation(id) {
      return (await evaluations(id))[0] ?? null;
    },

    async previousEvaluation(id) {
      return (await evaluations(id))[1] ?? null;
    },

    async evaluationHistory(id, max = HISTORY_POINTS) {
      return (await evaluations(id)).slice(0, max).reverse();
    },
  };
}

/**
 * 施策 id を作る。 人が URL で読めるよう title の slug を前に置き、 同名衝突を timestamp で分ける。
 * ファイル名にそのまま使うので slug 済みの文字だけで構成する。
 */
function makeInitiativeId(title: string, now: string, entropy = ''): string {
  const base = slug(title).slice(0, 48);
  const timestamp = stampToFile(now).replace(/[^0-9a-z]/gi, '').toLowerCase();
  const suffix = entropy.replace(/[^0-9a-z]/gi, '').toLowerCase().slice(0, 12);
  return `${base}-${timestamp}${suffix ? `-${suffix}` : ''}`;
}

const INITIATIVE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

function isInitiativeId(id: string): boolean {
  return INITIATIVE_ID_PATTERN.test(id);
}

function assertInitiativeId(id: string): string {
  if (!isInitiativeId(id)) throw new Error('invalid initiative id');
  return id;
}
