import { describe, expect, it } from 'vitest';
import { assessDegradeRisk, normalizeFanIn, normalizeHotspot } from '../degrade-risk.ts';

const SAFE = {
  maxFanIn: 1,
  fanInReference: 100,
  hotspotHits: 0,
  hotspotTotal: 50,
  regressionCoverage: 1,
  layerMismatchRatio: 0,
  requiredChecks: [],
  registeredTests: 12,
  openProposals: [],
  missing: [],
};

describe('normalizeFanIn / normalizeHotspot', () => {
  it('基準以上なら 1', () => {
    expect(normalizeFanIn(200, 100)).toBe(1);
    expect(normalizeHotspot(50, 50)).toBe(1);
  });

  it('基準が無い/該当なしでも 0 には落とさない (無情報を安全と読み替えない)', () => {
    expect(normalizeFanIn(10, 0)).toBe(0.2);
    expect(normalizeHotspot(0, 50)).toBe(0.2);
  });
});

describe('assessDegradeRisk', () => {
  it('安全な条件では危険度が低い', () => {
    expect(assessDegradeRisk(SAFE).risk).toBe(0);
  });

  it('fan-in 上位 × hotspot × 回帰テスト 0 × 二層不整合 で危険度が上がる', () => {
    const risky = assessDegradeRisk({
      ...SAFE,
      maxFanIn: 200,
      hotspotHits: 50,
      regressionCoverage: 0,
      layerMismatchRatio: 1,
    });
    expect(risky.risk).toBe(1);
  });

  it('safety floor が full で回帰テスト 0 件なら危険度を上限に張り付ける', () => {
    const result = assessDegradeRisk({
      ...SAFE,
      requiredChecks: ['spec_requirements'],
      registeredTests: 0,
    });
    expect(result.risk).toBe(1);
    expect(result.repayFirst[0]?.kind).toBe('test');
  });

  it('回帰テスト充足率が不明でも「充分」と読み替えない', () => {
    const unknown = assessDegradeRisk({
      ...SAFE,
      maxFanIn: 200,
      hotspotHits: 50,
      regressionCoverage: null,
      layerMismatchRatio: 1,
    });
    expect(unknown.breakdown.regressionCoverage).toBe(0.5);
    expect(unknown.risk).toBeCloseTo(0.5, 5);
  });

  it('未返済の整理提案を「先に返済」に積む', () => {
    const result = assessDegradeRisk({
      ...SAFE,
      openProposals: [{ domain: 'core', rule: 'god-module', action: 'split' }],
    });
    expect(result.repayFirst.some((r) => r.kind === 'refactoring')).toBe(true);
  });
});
