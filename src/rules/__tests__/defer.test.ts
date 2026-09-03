import { describe, expect, it } from 'vitest';
import { decideDefer } from '../defer.ts';
import type { DegradeRiskResult } from '../../initiative/types.ts';

const degrade = (risk: number): DegradeRiskResult => ({
  risk,
  breakdown: { fanIn: 1, hotspot: 1, regressionCoverage: 0, layerMismatch: 1 },
  requiredChecks: ['spec_requirements'],
  repayFirst: [{ kind: 'test', label: '回帰テストが 1 件も登録されていない' }],
  missing: [],
});

describe('decideDefer', () => {
  it('危険度が閾値以上なら見送り、 理由と返済リストを添える', () => {
    const result = decideDefer({ kind: 'improvement', degrade: degrade(0.8), threshold: 0.7 });
    expect(result.defer).toBe(true);
    expect(result.reasons[0]).toContain('デグレード危険度');
    expect(result.reasons.some((r) => r.startsWith('先に返済'))).toBe(true);
  });

  it('閾値未満なら見送らない', () => {
    expect(decideDefer({ kind: 'improvement', degrade: degrade(0.69), threshold: 0.7 }).defer).toBe(false);
  });

  it('new-content は見送りルールの対象外', () => {
    expect(decideDefer({ kind: 'new-content', degrade: degrade(1), threshold: 0.7 }).defer).toBe(false);
  });

  it('デグレード判定が無ければ見送らない', () => {
    expect(decideDefer({ kind: 'improvement', degrade: null, threshold: 0.7 }).defer).toBe(false);
  });
});
