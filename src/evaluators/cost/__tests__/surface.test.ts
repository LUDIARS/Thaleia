import { describe, expect, it } from 'vitest';
import {
  domainSurfaceSize,
  NEW_DOMAIN_FACTOR,
  scoreCost,
  summarizeSurface,
  surfaceToScore,
} from '../surface.ts';

const SMALL = { domain: 'links', files: 3, functions: 10, fanIn: 2, isNew: false };
const LARGE = { domain: 'core', files: 40, functions: 300, fanIn: 120, isNew: false };

describe('domainSurfaceSize', () => {
  it('ファイルを関数より重く数える', () => {
    expect(domainSurfaceSize(SMALL)).toBe(10 + 3 * 2 + 2);
  });
});

describe('summarizeSurface', () => {
  it('新規ドメインは既存中央値 × 1.5 で見積る', () => {
    const summary = summarizeSurface([{ ...SMALL, isNew: true }], 40);
    expect(summary.newDomainCount).toBe(1);
    expect(summary.fromNewDomains).toBeCloseTo(40 * NEW_DOMAIN_FACTOR, 5);
    expect(summary.existing).toBe(0);
  });

  it('既存と新規を足し合わせる', () => {
    const summary = summarizeSurface([SMALL, { ...LARGE, isNew: true }], 100);
    expect(summary.existing).toBe(domainSurfaceSize(SMALL));
    expect(summary.total).toBeCloseTo(domainSurfaceSize(SMALL) + 150, 5);
  });
});

describe('surfaceToScore', () => {
  it('面積が小さいほど高得点', () => {
    expect(surfaceToScore(0)).toBe(100);
    expect(surfaceToScore(10)).toBeGreaterThan(surfaceToScore(1000));
  });

  it('上限を超えたら 0 点', () => {
    expect(surfaceToScore(10_000)).toBe(0);
  });
});

describe('scoreCost', () => {
  it('ドメインを特定できなければ中立点にして missing を積む', () => {
    const result = scoreCost({ surfaces: [], medianSurface: 40, missing: [] });
    expect(result.score).toBe(50);
    expect(result.missing.map((m) => m.code)).toContain('cost_no_target_domain');
  });

  it('小さい変更のほうが高得点になる', () => {
    const small = scoreCost({ surfaces: [SMALL], medianSurface: 40, missing: [] });
    const large = scoreCost({ surfaces: [LARGE], medianSurface: 40, missing: [] });
    expect(small.score).toBeGreaterThan(large.score);
    expect(small.evidence.some((e) => e.label.includes('変更面積'))).toBe(true);
  });
});
