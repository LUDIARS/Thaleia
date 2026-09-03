import { describe, expect, it } from 'vitest';
import { isMismatched, scoreDomain, summarizeConsistency } from '../consistency.ts';
import type { DomainLayerStatus } from '../consistency.ts';

const aligned: DomainLayerStatus = {
  domain: 'evaluation',
  inBusinessLayer: true,
  inProgramLayer: true,
  linked: true,
  misfitCount: 0,
  openProposals: [],
};

describe('isMismatched', () => {
  it('両層にあって結ばれていれば整合', () => {
    expect(isMismatched(aligned)).toBe(false);
  });

  it('片側にしか無ければ不整合', () => {
    expect(isMismatched({ ...aligned, inBusinessLayer: false })).toBe(true);
    expect(isMismatched({ ...aligned, inProgramLayer: false })).toBe(true);
  });

  it('両層にあっても相互参照が無ければ不整合', () => {
    expect(isMismatched({ ...aligned, linked: false })).toBe(true);
  });
});

describe('summarizeConsistency', () => {
  it('不整合の割合を出す', () => {
    const summary = summarizeConsistency([aligned, { ...aligned, domain: 'x', linked: false }]);
    expect(summary.total).toBe(2);
    expect(summary.mismatched).toBe(1);
    expect(summary.mismatchRatio).toBeCloseTo(0.5, 5);
  });

  it('対象が無ければ割合 0', () => {
    expect(summarizeConsistency([]).mismatchRatio).toBe(0);
  });
});

describe('scoreDomain', () => {
  it('整合していれば満点', () => {
    const result = scoreDomain({ statuses: [aligned], organizationConflicts: [], missing: [] });
    expect(result.score).toBe(100);
  });

  it('二層不整合を減点する', () => {
    const result = scoreDomain({
      statuses: [{ ...aligned, linked: false }],
      organizationConflicts: [],
      missing: [],
    });
    expect(result.score).toBe(85);
    expect(result.evidence.some((e) => e.label.includes('二層不整合'))).toBe(true);
  });

  it('未返済の整理提案を減点し「先に返済」を出す (ドメインあたり上限 15 点)', () => {
    const proposals = Array.from({ length: 5 }, (_, i) => ({
      proposalId: `p${i}`,
      rule: 'god-module',
      action: 'split',
    }));
    const result = scoreDomain({
      statuses: [{ ...aligned, openProposals: proposals }],
      organizationConflicts: [],
      missing: [],
    });
    expect(result.score).toBe(85);
    expect(result.evidence.some((e) => e.label.includes('先に返済'))).toBe(true);
  });

  it('ドメインを特定できなければ満点を出さず missing を積む', () => {
    const result = scoreDomain({ statuses: [], organizationConflicts: [], missing: [] });
    expect(result.score).toBe(50);
    expect(result.missing.map((m) => m.code)).toContain('domain_no_target_domain');
  });
});
