import { describe, expect, it } from 'vitest';
import { clampAxis, countQuadrants, hasQuadrantOneMajority, toQuadrant } from '../quadrant.ts';

describe('toQuadrant', () => {
  it('体験価値 高 × 実現性 高 → I 推進', () => {
    expect(toQuadrant(0.8, 0.9)).toBe('I');
  });

  it('体験価値 高 × 実現性 低 → II 条件付き推進', () => {
    expect(toQuadrant(-0.4, 0.7)).toBe('II');
  });

  it('体験価値 低 × 実現性 高 → III 再考', () => {
    expect(toQuadrant(0.6, -0.2)).toBe('III');
  });

  it('体験価値 低 × 実現性 低 → IV 却下', () => {
    expect(toQuadrant(-0.9, -0.9)).toBe('IV');
  });

  it('境界 0 は「高」に倒す (決定的に再現するため)', () => {
    expect(toQuadrant(0, 0)).toBe('I');
  });
});

describe('clampAxis', () => {
  it('-1..+1 に丸める', () => {
    expect(clampAxis(5)).toBe(1);
    expect(clampAxis(-5)).toBe(-1);
    expect(clampAxis(Number.NaN)).toBe(0);
  });
});

describe('countQuadrants / hasQuadrantOneMajority', () => {
  it('象限ごとに数える', () => {
    expect(countQuadrants(['I', 'I', 'IV'])).toEqual({ I: 2, II: 0, III: 0, IV: 1 });
  });

  it('過半のときだけ true', () => {
    expect(hasQuadrantOneMajority({ I: 2, II: 0, III: 0, IV: 1 })).toBe(true);
    expect(hasQuadrantOneMajority({ I: 2, II: 1, III: 0, IV: 1 })).toBe(false);
    expect(hasQuadrantOneMajority({ I: 0, II: 0, III: 0, IV: 0 })).toBe(false);
  });
});
