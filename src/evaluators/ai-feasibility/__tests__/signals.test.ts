import { describe, expect, it } from 'vitest';
import { priorsSignal, scaffoldingSignal, scoreAiFeasibility } from '../signals.ts';
import type { PriorJudgment } from '../signals.ts';

const positive: PriorJudgment = {
  cardId: 'c1',
  situation: '似た施策を通した',
  judgment: '進めた',
  score: 0.8,
  negative: false,
  url: null,
};
const negative: PriorJudgment = {
  cardId: 'c2',
  situation: '似た施策を見送った',
  judgment: '見送り',
  score: 0.9,
  negative: true,
  url: 'http://localhost:4230/?card=c2',
};

describe('scaffoldingSignal', () => {
  it('両方取れれば平均', () => {
    expect(scaffoldingSignal(0.4, 0.6)).toBeCloseTo(0.5, 5);
  });

  it('片方だけならその値を使う', () => {
    expect(scaffoldingSignal(0.4, null)).toBeCloseTo(0.4, 5);
  });

  it('どちらも取れなければ中立 0.5', () => {
    expect(scaffoldingSignal(null, null)).toBe(0.5);
  });
});

describe('priorsSignal', () => {
  it('過去実績が無ければ中立 0.5', () => {
    expect(priorsSignal([])).toBe(0.5);
  });

  it('見送り実績が多いほど下がる', () => {
    expect(priorsSignal([negative, negative])).toBe(0);
    expect(priorsSignal([positive, negative])).toBeCloseTo(0.5, 5);
    expect(priorsSignal([positive])).toBe(1);
  });
});

describe('scoreAiFeasibility', () => {
  const base = {
    specificity: { acceptance: 1, screenFlow: 1, dataFields: 1 },
    specLinkDensity: 0.8,
    testQuotaFill: 0.8,
    splitPlan: ['全機能を配線してからテストを足す'],
    missing: [],
  };

  it('見送り実績があると減点し evidence に貼る', () => {
    const without = scoreAiFeasibility({ ...base, priors: [positive] });
    const withNegative = scoreAiFeasibility({ ...base, priors: [positive, negative] });
    expect(withNegative.score).toBeLessThan(without.score);
    expect(withNegative.evidence.some((e) => e.label.includes('過去に見送った判断'))).toBe(true);
    expect(withNegative.evidence.some((e) => e.url === negative.url)).toBe(true);
  });

  it('欠損の数だけ confidence が下がる (入力 4 本)', () => {
    const result = scoreAiFeasibility({
      ...base,
      priors: [],
      missing: [{ code: 'genius_query_unavailable', reason: 'connection refused' }],
    });
    expect(result.confidence).toBeCloseTo(0.75, 5);
  });

  it('分割案を evidence に出す', () => {
    const result = scoreAiFeasibility({ ...base, priors: [] });
    expect(result.evidence.some((e) => e.label.includes('分割案'))).toBe(true);
  });
});
