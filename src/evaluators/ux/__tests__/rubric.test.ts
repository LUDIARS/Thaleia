import { describe, expect, it } from 'vitest';
import { scoreUx, weightedRubric } from '../rubric.ts';

const FULL = { flowConsistency: 80, learningCost: 60, existingFit: 70, intentClarity: 90 };

describe('weightedRubric', () => {
  it('重み付き平均を返す', () => {
    // 80*.3 + 60*.2 + 70*.25 + 90*.25 = 24 + 12 + 17.5 + 22.5 = 76
    expect(weightedRubric(FULL)).toBeCloseTo(76, 5);
  });

  it('範囲外の採点は 0..100 に丸める', () => {
    expect(
      weightedRubric({ flowConsistency: 500, learningCost: -20, existingFit: 100, intentClarity: 100 }),
    ).toBeCloseTo(30 + 0 + 25 + 25, 5);
  });
});

describe('scoreUx', () => {
  it('体験制約との矛盾 1 件につき減点する', () => {
    const base = scoreUx({
      scores: FULL,
      intendedAffect: '一撃で気持ちよく倒す',
      knownSurfaces: 3,
      conflicts: [],
      missing: [],
    });
    const conflicted = scoreUx({
      scores: FULL,
      intendedAffect: '一撃で気持ちよく倒す',
      knownSurfaces: 3,
      conflicts: [{ constraint: '応答 20 ms', detail: '毎フレーム LLM を呼ぶ設計になっている' }],
      missing: [],
    });
    expect(conflicted.score).toBe(base.score - 8);
    expect(conflicted.evidence.some((e) => e.label.includes('体験制約と矛盾'))).toBe(true);
  });

  it('LLM 採点が取れなくても 0 点にせず中立点にし、 confidence を落とす', () => {
    const result = scoreUx({
      scores: null,
      intendedAffect: null,
      knownSurfaces: 0,
      conflicts: [],
      missing: [
        { code: 'llm_ux_rubric_failed', reason: 'claude CLI が落ちた' },
        { code: 'anatomia_screens_unavailable', reason: 'not-prepared' },
      ],
    });
    expect(result.score).toBe(50);
    expect(result.confidence).toBeCloseTo(1 / 3, 3);
  });

  it('欠損が無ければ confidence は 1', () => {
    const result = scoreUx({
      scores: FULL,
      intendedAffect: 'x',
      knownSurfaces: 2,
      conflicts: [],
      missing: [],
    });
    expect(result.confidence).toBe(1);
  });
});
