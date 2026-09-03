import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideVerdict } from '../../../aggregate/verdict.ts';
import { DEFAULT_WEIGHTS } from '../../../config.ts';
import type { EvaluationContext } from '../../context.ts';
import { evaluateDiscussion } from '../engine.ts';
import { BASE_THRESHOLD } from '../persona-score.ts';
import { makeInitiativeStore } from '../../../initiative/store.ts';
import type { Evaluation } from '../../../initiative/types.ts';

describe('evaluateDiscussion', () => {
  it('LLM が空の写像を返しても象限 I の票や go 条件を捏造しない', async () => {
    const context = {
      initiative: {
        id: 'initiative-1',
        title: '企画',
        kind: 'new-content',
        project: 'project',
        body: '本文',
        discutere: { gapId: 'gap-1' },
        createdAt: '2026-09-03T00:00:00.000Z',
        updatedAt: '2026-09-03T00:00:00.000Z',
      },
      deps: {
        config: {
          weights: DEFAULT_WEIGHTS,
          discutereWebUrl: null,
        },
        discutere: {
          getPersonaConsensus: async () => [{
            personaId: 'persona-1',
            displayName: 'Persona',
            traits: [],
            utterances: [],
            opinionScore: 10,
            consensusScore: 10,
            agreeRatio: 1,
          }],
        },
        llm: async () => '{"personas":[]}',
        dataDir: join(process.cwd(), '.nonexistent-discussion-test-data'),
      },
    } as unknown as EvaluationContext;

    const result = await evaluateDiscussion({ context, intendedAffect: null });

    expect(result.detail?.quadrantCounts).toEqual({ I: 0, II: 0, III: 0, IV: 0 });
    expect(result.detail?.majorityBonus).toBe(0);
    expect(result.hasCompleteMapping).toBe(false);
    expect(result.axis.missing.map((missing) => missing.code)).toContain('llm_persona_mapping_incomplete');
    expect(decideVerdict({
      total: 90,
      defer: false,
      quadrantCounts: result.detail?.quadrantCounts ?? null,
    })).toBe('conditional');
  });

  it('一部のペルソナだけ写像できても過半判定を verdict に使わない', async () => {
    const context = {
      initiative: {
        id: 'initiative-1', title: '企画', kind: 'new-content', project: 'project', body: '本文',
        discutere: { gapId: 'gap-1' }, createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z',
      },
      deps: {
        config: { weights: DEFAULT_WEIGHTS, discutereWebUrl: null },
        discutere: {
          getPersonaConsensus: async () => ['a', 'b'].map((personaId) => ({
            personaId, displayName: personaId, traits: [], utterances: [],
            opinionScore: 10, consensusScore: 10, agreeRatio: 1,
          })),
        },
        llm: async () => '{"personas":[{"personaId":"a","feasibility":1,"experienceValue":1,"traitFit":1}]}',
        dataDir: join(process.cwd(), '.nonexistent-discussion-test-data'),
      },
    } as unknown as EvaluationContext;

    const result = await evaluateDiscussion({ context, intendedAffect: null });

    expect(result.detail?.quadrantCounts.I).toBe(1);
    expect(result.detail?.majorityBonus).toBe(0);
    expect(result.hasCompleteMapping).toBe(false);
    expect(decideVerdict({ total: 90, defer: false, quadrantCounts: null })).toBe('conditional');
  });

  it('ペルソナ閾値の上書きが壊れていても評価を落とさず missing に積む', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'thaleia-persona-'));
    await mkdir(join(dataDir, 'personas'), { recursive: true });
    await writeFile(join(dataDir, 'personas', 'a.json'), '{ broken', 'utf8');

    const context = {
      initiative: {
        id: 'initiative-1', title: '企画', kind: 'new-content', project: 'project', body: '本文',
        discutere: { gapId: 'gap-1' }, createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z',
      },
      deps: {
        config: { weights: DEFAULT_WEIGHTS, discutereWebUrl: null },
        discutere: {
          getPersonaConsensus: async () => [{
            personaId: 'a', displayName: 'a', traits: [], utterances: [],
            opinionScore: 10, consensusScore: 10, agreeRatio: 1,
          }],
        },
        llm: async () => '{"personas":[{"personaId":"a","feasibility":1,"experienceValue":1,"traitFit":1}]}',
        dataDir,
      },
    } as unknown as EvaluationContext;

    const result = await evaluateDiscussion({ context, intendedAffect: null });

    expect(result.axis.missing.map((missing) => missing.code))
      .toContain('persona_threshold_override_unreadable');
    // 上書きは無かったことにして traits 由来の初期閾値へ戻す (評価自体は続行する)。
    expect(result.detail?.personas[0]?.threshold).toBe(BASE_THRESHOLD);
    await rm(dataDir, { recursive: true, force: true });
  });

  it('自動起票した gap を保存し、次の評価では同じ gap を再利用する', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'thaleia-discussion-gap-'));
    const store = makeInitiativeStore(dataDir);
    const initiative = await store.create(
      { title: '企画', kind: 'new-content', project: 'project', body: '本文' },
      '2026-09-03T00:00:00.000Z',
    );
    let createCalls = 0;
    const discutere = {
      createGap: async () => {
        createCalls += 1;
        return { gapId: 'gap-created', sessionId: 'session-1' };
      },
      getPersonaConsensus: async () => [],
    };
    const deps = {
      config: { weights: DEFAULT_WEIGHTS, discutereWebUrl: null },
      discutere,
      llm: async () => '{"personas":[]}',
      dataDir,
    };

    const first = await evaluateDiscussion({
      context: { initiative, deps } as unknown as EvaluationContext,
      intendedAffect: null,
    });
    await store.saveEvaluation({
      initiativeId: initiative.id,
      evaluatedAt: '2026-09-03T00:01:00.000Z',
      discussion: first.detail,
    } as unknown as Evaluation);

    const saved = await store.get(initiative.id);
    expect(saved?.discutere?.gapId).toBe('gap-created');
    await evaluateDiscussion({
      context: { initiative: saved, deps } as unknown as EvaluationContext,
      intendedAffect: null,
    });
    expect(createCalls).toBe(1);
    await rm(dataDir, { recursive: true, force: true });
  });
});
