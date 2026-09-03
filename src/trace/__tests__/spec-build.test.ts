import { describe, it, expect } from 'vitest';
import { buildSpecTrace } from '../build.ts';
import type { AnatomiaGraph } from '../../clients/anatomia-types.ts';
import type { AnatomiaSpecLink } from '../types.ts';

const graph: AnatomiaGraph = {
  nodes: [
    { id: 'f1', name: 'tick', kind: 'function', path: '/src/sm/tick.ts' },
    { id: 'f2', name: 'transition', kind: 'function', path: '/src/sm/state.ts' },
    { id: 'g1', name: 'render', kind: 'function', path: '/src/ui/render.ts' },
  ],
  edges: [],
};

const implementorsByDomain = {
  'state-machine': ['f1', 'f2'],
  ui: ['g1'],
};

const specLinks: AnatomiaSpecLink[] = [
  { from: 'f1', fromName: 'tick', clauseHeading: 'Tick', clauseFile: '/spec/sm.md', confidence: 0.9, ratified: true },
  { from: '/src/ui/render.ts', fromName: '/src/ui/render.ts', clauseHeading: '描画', clauseFile: '/spec/ui.md', confidence: 0.6, ratified: false },
];

describe('buildSpecTrace', () => {
  it('spec の target ドメイン群を実装関数 + spec-links へ束ねる', () => {
    const r = buildSpecTrace({
      specCode: 'SPEC-1',
      specTitle: 'ゲームループ',
      targetDomains: ['state-machine', 'ui'],
      implementorsByDomain,
      graph,
      specLinks,
    });
    expect(r.specCode).toBe('SPEC-1');
    expect(r.targetDomains).toEqual(['state-machine', 'ui']);
    expect(r.domains).toHaveLength(2);
    expect(r.summary.domainCount).toBe(2);
    expect(r.summary.matchedDomains).toBe(2);
    // state-machine 2 関数 + ui 1 関数。
    expect(r.summary.functionCount).toBe(3);
    // tick(link) + render(file-link)。 transition は link 無し。
    expect(r.summary.linkedFunctions).toBe(2);
  });

  it('未検出 target は matched=false で関数空 (matchedDomains に数えない)', () => {
    const r = buildSpecTrace({
      specCode: 'SPEC-2',
      specTitle: 'X',
      targetDomains: ['state-machine', 'unknown'],
      implementorsByDomain,
      graph,
      specLinks,
    });
    expect(r.summary.domainCount).toBe(2);
    expect(r.summary.matchedDomains).toBe(1);
    const unknown = r.domains.find((d) => d.domain === 'unknown')!;
    expect(unknown.matched).toBe(false);
    expect(unknown.functions).toEqual([]);
  });

  it('target ドメインの重複は正規化名で 1 つに畳む', () => {
    const r = buildSpecTrace({
      specCode: 'SPEC-3',
      specTitle: 'dup',
      targetDomains: ['state-machine', 'State_Machine'],
      implementorsByDomain,
      graph,
      specLinks,
    });
    expect(r.targetDomains).toEqual(['state-machine']);
    expect(r.domains).toHaveLength(1);
    expect(r.summary.functionCount).toBe(2);
  });

  it('target ドメインが無い spec は空サマリ', () => {
    const r = buildSpecTrace({
      specCode: 'SPEC-4',
      specTitle: 'no-target',
      targetDomains: [],
      implementorsByDomain,
      graph,
      specLinks,
    });
    expect(r.domains).toEqual([]);
    expect(r.summary).toMatchObject({ domainCount: 0, matchedDomains: 0, functionCount: 0, linkedFunctions: 0 });
  });
});
