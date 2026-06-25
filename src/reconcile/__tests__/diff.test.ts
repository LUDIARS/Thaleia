import { describe, it, expect } from 'vitest';
import { diffReconcile } from '../diff.ts';
import type { ReconcileResult } from '../types.ts';

function make(over: Partial<ReconcileResult>): ReconcileResult {
  return {
    project: 'demo',
    pfProjectId: '',
    anatomiaProject: '',
    generatedAt: '2026-06-25T00:00:00.000Z',
    domainMatches: [],
    sceneMatches: [],
    specCoverage: [],
    gaps: { specsWithoutImpl: [], codeDomainsWithoutSpec: [], codeScreensWithoutSpec: [] },
    summary: {
      pfDomains: 0, anatomiaDomains: 0, matchedDomains: 0,
      pfScenes: 0, anatomiaScreens: 0, matchedScenes: 0,
      specs: 0, implementedSpecs: 0,
    },
    ...over,
  };
}

describe('diffReconcile', () => {
  it('初回 (prev=null) は hasPrevious=false で全空 (全 added ノイズを出さない)', () => {
    const curr = make({ domainMatches: [{ pfDomain: 'Player', anatomiaDomain: null, status: 'spec-only' }] });
    const d = diffReconcile(null, curr);
    expect(d.hasPrevious).toBe(false);
    expect(d.domains).toEqual({ added: [], removed: [], statusChanged: [] });
    expect(d.specs.added).toEqual([]);
  });

  it('ドメインの出入りと status 変化を出す', () => {
    const prev = make({
      domainMatches: [
        { pfDomain: 'Player', anatomiaDomain: null, status: 'spec-only' },
        { pfDomain: 'Enemy', anatomiaDomain: 'enemy', status: 'name-mismatch' },
      ],
    });
    const curr = make({
      domainMatches: [
        { pfDomain: 'Player', anatomiaDomain: 'player', status: 'name-mismatch' }, // 実装された
        { pfDomain: 'Inventory', anatomiaDomain: null, status: 'spec-only' }, // 新規
        // Enemy は消えた
      ],
    });
    const d = diffReconcile(prev, curr);
    expect(d.hasPrevious).toBe(true);
    expect(d.previousAt).toBe('2026-06-25T00:00:00.000Z');
    expect(d.domains.added).toEqual(['Inventory']);
    expect(d.domains.removed).toEqual(['Enemy']);
    expect(d.domains.statusChanged).toEqual([{ name: 'Player', from: 'spec-only', to: 'name-mismatch' }]);
  });

  it('仕様の前進 (nowImplemented) と退行 (regressed) を分ける', () => {
    const cov = (code: string, implemented: boolean) => ({
      specCode: code, specTitle: code, targetDomains: [], targetScenes: [], implemented, evidence: '',
    });
    const prev = make({ specCoverage: [cov('A', false), cov('B', true), cov('C', true)] });
    const curr = make({ specCoverage: [cov('A', true), cov('B', false), cov('D', true)] });
    const d = diffReconcile(prev, curr);
    expect(d.specs.nowImplemented).toEqual(['A']);
    expect(d.specs.regressed).toEqual(['B']);
    expect(d.specs.added).toEqual(['D']);
    expect(d.specs.removed).toEqual(['C']);
  });

  it('summaryDelta は 0 でない増減だけ出す', () => {
    const prev = make({ summary: { ...make({}).summary, matchedDomains: 1, specs: 3 } });
    const curr = make({ summary: { ...make({}).summary, matchedDomains: 3, specs: 3, implementedSpecs: 2 } });
    const d = diffReconcile(prev, curr);
    expect(d.summaryDelta).toEqual({ matchedDomains: 2, implementedSpecs: 2 });
  });

  it('シーンの出入りも domain と同様に出す', () => {
    const prev = make({ sceneMatches: [{ pfScene: 'Title', anatomiaScreen: null, status: 'spec-only' }] });
    const curr = make({ sceneMatches: [{ pfScene: 'Title', anatomiaScreen: 'Title', status: 'matched' }] });
    const d = diffReconcile(prev, curr);
    expect(d.scenes.statusChanged).toEqual([{ name: 'Title', from: 'spec-only', to: 'matched' }]);
  });
});
