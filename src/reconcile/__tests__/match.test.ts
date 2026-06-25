import { describe, it, expect } from 'vitest';
import { reconcile, normalizeName } from '../match.ts';

describe('normalizeName', () => {
  it('folds case, separators and width', () => {
    expect(normalizeName('Player Move')).toBe('playermove');
    expect(normalizeName('player-move')).toBe('playermove');
    expect(normalizeName('player_move')).toBe('playermove');
    expect(normalizeName('Player.Move')).toBe('playermove');
  });
});

describe('reconcile', () => {
  const result = reconcile({
    project: 'demo',
    pfDomains: [
      { id: 'd1', name: 'Player' },
      { id: 'd2', name: 'Enemy' },
      { id: 'd3', name: 'Inventory' },
    ],
    pfSpecs: [
      { id: 's1', code: 'SPEC-001', title: 'WASD移動', targetDomains: ['Player'] },
      { id: 's2', code: 'SPEC-002', title: '所持品管理', targetDomains: ['Inventory'] },
      { id: 's3', code: 'SPEC-003', title: '対象未指定', targetDomains: [] },
    ],
    anatomiaDomains: [
      { name: 'player', implementorCount: 3 },
      { name: 'enemy', implementorCount: 2 },
      { name: 'hp-bar', implementorCount: 1 },
    ],
  });

  it('matches domains across naming styles (name-mismatch)', () => {
    const player = result.domainMatches.find((m) => m.pfDomain === 'Player');
    expect(player).toEqual({ pfDomain: 'Player', anatomiaDomain: 'player', status: 'name-mismatch' });
  });

  it('flags a Praeforma domain with no implementation as spec-only', () => {
    const inv = result.domainMatches.find((m) => m.pfDomain === 'Inventory');
    expect(inv?.status).toBe('spec-only');
    expect(inv?.anatomiaDomain).toBeNull();
  });

  it('flags an Anatomia domain with no spec as code-only (仕様欠落)', () => {
    const hp = result.domainMatches.find((m) => m.anatomiaDomain === 'hp-bar');
    expect(hp?.status).toBe('code-only');
    expect(result.gaps.codeDomainsWithoutSpec).toContain('hp-bar');
  });

  it('marks a spec implemented when its target domain has code', () => {
    const s1 = result.specCoverage.find((s) => s.specCode === 'SPEC-001');
    expect(s1?.implemented).toBe(true);
  });

  it('marks specs without implementation (両方向ギャップ)', () => {
    expect(result.gaps.specsWithoutImpl).toEqual(['SPEC-002', 'SPEC-003']);
    const s3 = result.specCoverage.find((s) => s.specCode === 'SPEC-003');
    expect(s3?.evidence).toMatch(/未指定/);
  });

  it('summarises counts', () => {
    expect(result.summary).toEqual({
      pfDomains: 3,
      anatomiaDomains: 3,
      matchedDomains: 2,
      specs: 3,
      implementedSpecs: 1,
    });
  });
});
