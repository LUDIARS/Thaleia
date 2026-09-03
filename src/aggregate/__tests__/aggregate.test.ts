import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../../config.ts';
import { computeConfidence } from '../confidence.ts';
import { computeTotal } from '../total.ts';
import { buildConditions, decideVerdict } from '../verdict.ts';
import type { AxisResult } from '../../initiative/types.ts';

function axes(score: number, confidence = 1): AxisResult[] {
  return (['ux', 'cost', 'ai-feasibility', 'domain', 'discussion'] as const).map((axis) => ({
    axis,
    score,
    confidence,
    evidence: [],
    missing: [],
  }));
}

describe('computeTotal', () => {
  it('重み付き合計を返す (重みの和は 1)', () => {
    expect(computeTotal(axes(80), DEFAULT_WEIGHTS, 0)).toBe(80);
  });

  it('凡庸性ペナルティを引く', () => {
    expect(computeTotal(axes(80), DEFAULT_WEIGHTS, 12.5)).toBe(67.5);
  });

  it('0 を下回らない', () => {
    expect(computeTotal(axes(10), DEFAULT_WEIGHTS, 100)).toBe(0);
  });
});

describe('computeConfidence', () => {
  it('軸 confidence の積', () => {
    expect(computeConfidence(axes(50, 0.5))).toBeCloseTo(0.5 ** 5, 3);
  });

  it('軸が無ければ 0', () => {
    expect(computeConfidence([])).toBe(0);
  });

  it('種別ルールの欠損も判定 confidence を下げる', () => {
    expect(computeConfidence(axes(50), [{ code: 'augur_unavailable', reason: '取得不能' }])).toBe(0.5);
  });
});

describe('decideVerdict', () => {
  const majority = { I: 3, II: 1, III: 0, IV: 0 };
  const split = { I: 1, II: 1, III: 1, IV: 1 };

  it('見送りは他の軸より優先される', () => {
    expect(decideVerdict({ total: 100, defer: true, quadrantCounts: majority })).toBe('defer');
  });

  it('70 点以上 かつ 象限 I 過半 なら go', () => {
    expect(decideVerdict({ total: 70, defer: false, quadrantCounts: majority })).toBe('go');
  });

  it('象限 I が過半でなければ go にしない', () => {
    expect(decideVerdict({ total: 90, defer: false, quadrantCounts: split })).toBe('conditional');
  });

  it('議論が取れなければ go にしない', () => {
    expect(decideVerdict({ total: 90, defer: false, quadrantCounts: null })).toBe('conditional');
  });

  it('50 点未満は no-go', () => {
    expect(decideVerdict({ total: 49.9, defer: false, quadrantCounts: majority })).toBe('no-go');
  });
});

describe('buildConditions', () => {
  it('欠損と減点理由を条件として並べる', () => {
    const withMissing = axes(60);
    withMissing[0] = {
      ...(withMissing[0] as AxisResult),
      missing: [{ code: 'genius_unconfigured', reason: 'Genius が未設定' }],
    };
    const conditions = buildConditions(withMissing, ['discussion 軸が 40 点']);
    expect(conditions[0]).toContain('Genius が未設定');
    expect(conditions).toContain('discussion 軸が 40 点');
  });

  it('種別ルールの欠損も条件に含める', () => {
    const conditions = buildConditions(
      axes(60),
      [],
      [{ code: 'banality_no_reference_patterns', reason: '既存パターンを参照できない' }],
    );
    expect(conditions).toContain('種別ルールの欠損を埋める: 既存パターンを参照できない');
  });
});
