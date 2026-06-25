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
      pfScenes: 0,
      anatomiaScreens: 0,
      matchedScenes: 0,
      specs: 3,
      implementedSpecs: 1,
    });
  });

  it('keeps sceneMatches empty + scene gaps absent when no layouts/screens given', () => {
    expect(result.sceneMatches).toEqual([]);
    expect(result.gaps.codeScreensWithoutSpec).toEqual([]);
  });
});

describe('reconcile — scene(layout) target', () => {
  const result = reconcile({
    project: 'demo',
    pfDomains: [],
    pfLayouts: [
      { id: 'l1', name: 'TitleScreen' },
      { id: 'l2', name: 'Battle Scene' },
      { id: 'l3', name: 'ResultScreen' },
    ],
    pfSpecs: [
      { id: 's1', code: 'SC-001', title: 'タイトル表示', targetDomains: [], targetScenes: ['TitleScreen'] },
      { id: 's2', code: 'SC-002', title: '結果表示', targetDomains: [], targetScenes: ['ResultScreen'] },
    ],
    anatomiaDomains: [],
    anatomiaScreens: [
      { name: 'titlescreen' }, // 表記ゆれ (TitleScreen ↔ titlescreen)
      { name: 'BattleScene' }, // 表記ゆれ (Battle Scene ↔ BattleScene)
      { name: 'PauseMenu' }, // 仕様の無い実装スクリーン (code-only)
    ],
  });

  it('matches scenes across naming styles (name-mismatch)', () => {
    const t = result.sceneMatches.find((m) => m.pfScene === 'TitleScreen');
    expect(t).toEqual({ pfScene: 'TitleScreen', anatomiaScreen: 'titlescreen', status: 'name-mismatch' });
    const b = result.sceneMatches.find((m) => m.pfScene === 'Battle Scene');
    expect(b?.status).toBe('name-mismatch');
  });

  it('flags a Praeforma scene with no screen as spec-only', () => {
    const r = result.sceneMatches.find((m) => m.pfScene === 'ResultScreen');
    expect(r?.status).toBe('spec-only');
    expect(r?.anatomiaScreen).toBeNull();
  });

  it('flags an Anatomia screen with no spec as code-only', () => {
    const p = result.sceneMatches.find((m) => m.anatomiaScreen === 'PauseMenu');
    expect(p?.status).toBe('code-only');
    expect(result.gaps.codeScreensWithoutSpec).toContain('PauseMenu');
  });

  it('marks a spec implemented when its target scene has a screen', () => {
    const s1 = result.specCoverage.find((s) => s.specCode === 'SC-001');
    expect(s1?.implemented).toBe(true);
    expect(s1?.evidence).toContain('scene:TitleScreen');
  });

  it('marks a spec unimplemented when its target scene has no screen', () => {
    const s2 = result.specCoverage.find((s) => s.specCode === 'SC-002');
    expect(s2?.implemented).toBe(false);
    expect(result.gaps.specsWithoutImpl).toContain('SC-002');
  });

  it('counts scenes in the summary', () => {
    expect(result.summary.pfScenes).toBe(3);
    expect(result.summary.anatomiaScreens).toBe(3);
    expect(result.summary.matchedScenes).toBe(2);
  });
});
