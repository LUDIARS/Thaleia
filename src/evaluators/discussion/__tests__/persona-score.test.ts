import { describe, expect, it } from 'vitest';
import {
  BASE_THRESHOLD,
  MAJORITY_BONUS,
  TOP_OPPONENT_PENALTY,
  scorePersonas,
  thresholdFromTraits,
  topOpponents,
} from '../persona-score.ts';
import type { PersonaScoreInput } from '../persona-score.ts';

const WEIGHTS = { opinion: 0.4, consensus: 0.4, traitFit: 0.2 };

function persona(overrides: Partial<PersonaScoreInput> & { personaId: string }): PersonaScoreInput {
  return {
    displayName: overrides.personaId,
    traits: [],
    opinionScore: 0,
    consensusScore: 0,
    traitFit: 0.5,
    feasibility: 0.5,
    experienceValue: 0.5,
    thresholdOverride: null,
    utterances: [],
    ...overrides,
  };
}

describe('thresholdFromTraits', () => {
  it('traits が無ければ基準値', () => {
    expect(thresholdFromTraits([])).toBe(BASE_THRESHOLD);
  });

  it('慎重寄りは閾値が上がり、 新規性重視は下がる', () => {
    expect(thresholdFromTraits(['慎重'])).toBe(BASE_THRESHOLD + 5);
    expect(thresholdFromTraits(['新規性重視'])).toBe(BASE_THRESHOLD - 5);
  });

  it('可動域の外へは出ない', () => {
    expect(thresholdFromTraits(Array(20).fill('慎重'))).toBe(80);
    expect(thresholdFromTraits(Array(20).fill('挑戦'))).toBe(35);
  });
});

describe('scorePersonas', () => {
  it('議論内の最大値で正規化し、 単独で合否を出す', () => {
    const result = scorePersonas(
      [
        persona({ personaId: 'top', opinionScore: 10, consensusScore: 10, traitFit: 1 }),
        persona({ personaId: 'low', opinionScore: 0, consensusScore: 0, traitFit: 0 }),
      ],
      WEIGHTS,
    );
    expect(result.personas[0]?.internal).toBe(100);
    expect(result.personas[0]?.pass).toBe(true);
    expect(result.personas[1]?.internal).toBe(0);
    expect(result.personas[1]?.pass).toBe(false);
    // pass 内部スコア合計 / 全内部スコア合計 = 100 / 100 → 100 に象限 I 過半の加点。
    expect(result.baseScore).toBe(100);
  });

  it('象限 I が過半なら加点する', () => {
    const result = scorePersonas(
      [
        persona({ personaId: 'a', opinionScore: 5, feasibility: 1, experienceValue: 1 }),
        persona({ personaId: 'b', opinionScore: 5, feasibility: 1, experienceValue: 1 }),
        persona({ personaId: 'c', opinionScore: 5, feasibility: -1, experienceValue: -1 }),
      ],
      WEIGHTS,
    );
    expect(result.quadrantCounts.I).toBe(2);
    expect(result.majorityBonus).toBe(MAJORITY_BONUS);
  });

  it('内部スコア上位が象限 IV にいると減点する', () => {
    const result = scorePersonas(
      [
        persona({
          personaId: 'boss',
          opinionScore: 10,
          consensusScore: 10,
          traitFit: 1,
          feasibility: -1,
          experienceValue: -1,
        }),
        persona({ personaId: 'a', opinionScore: 1, feasibility: 1, experienceValue: 1 }),
        persona({ personaId: 'b', opinionScore: 1, feasibility: 1, experienceValue: 1 }),
      ],
      WEIGHTS,
    );
    expect(result.topOpponents).toEqual(['boss']);
    expect(result.topOpponentPenalty).toBe(TOP_OPPONENT_PENALTY);
  });

  it('閾値の上書きが効く', () => {
    const result = scorePersonas(
      [persona({ personaId: 'a', opinionScore: 10, traitFit: 0, thresholdOverride: 100 })],
      WEIGHTS,
    );
    expect(result.personas[0]?.threshold).toBe(100);
    expect(result.personas[0]?.pass).toBe(false);
  });

  it('誰も採点されていなければ軸スコアは 0', () => {
    const result = scorePersonas([persona({ personaId: 'a', traitFit: 0 })], WEIGHTS);
    expect(result.personas[0]?.internal).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('topOpponents', () => {
  it('上位 1/3 のうち象限 IV のペルソナだけを返す', () => {
    const result = scorePersonas(
      [
        persona({ personaId: 'a', opinionScore: 9, feasibility: 1, experienceValue: 1 }),
        persona({ personaId: 'b', opinionScore: 5, feasibility: -1, experienceValue: -1 }),
        persona({ personaId: 'c', opinionScore: 1, feasibility: -1, experienceValue: -1 }),
      ],
      WEIGHTS,
    );
    expect(topOpponents(result.personas).map((p) => p.personaId)).toEqual([]);
  });
});
