import { describe, it, expect } from 'vitest';
import { buildTrace, MAX_TRACE_FUNCTIONS } from '../build.ts';
import type { AnatomiaGraph } from '../../clients/anatomia-types.ts';
import type { AnatomiaSpecLink } from '../types.ts';

const graph: AnatomiaGraph = {
  nodes: [
    { id: 'f1', name: 'tick', kind: 'function', path: '/src/sm/tick.ts' },
    { id: 'f2', name: 'transition', kind: 'function', path: '/src/sm/state.ts' },
    { id: 'f3', name: 'reset', kind: 'function', path: '/src/sm/state.ts' },
  ],
  edges: [],
};

const implementorsByDomain = { 'state-machine': ['f1', 'f2', 'f3', 'ghost'] };

const specLinks: AnatomiaSpecLink[] = [
  // 関数 anchor 直当て
  { from: 'f1', fromName: 'tick', clauseHeading: 'Tick ループ', clauseFile: '/spec/sm.md', confidence: 0.9, ratified: true },
  // ファイル単位 (f2/f3 が同じファイル)
  { from: '/src/sm/state.ts', fromName: '/src/sm/state.ts', clauseHeading: '状態遷移', clauseFile: '/spec/sm.md', confidence: 0.7, ratified: false },
];

describe('buildTrace', () => {
  it('対象ドメインの実装関数を解決し spec-links を join する', () => {
    const r = buildTrace({ domain: 'state-machine', implementorsByDomain, graph, specLinks });
    expect(r.matched).toBe(true);
    // f1 は anchor 直当て、 f2/f3 はファイル当て。 ghost は graph に無いので除外。
    expect(r.functions.map((f) => f.id).sort()).toEqual(['f1', 'f2', 'f3']);
    const f1 = r.functions.find((f) => f.id === 'f1')!;
    expect(f1.specLinks[0]).toMatchObject({ clauseHeading: 'Tick ループ', confidence: 0.9 });
    const f2 = r.functions.find((f) => f.id === 'f2')!;
    expect(f2.specLinks[0]).toMatchObject({ clauseHeading: '状態遷移', confidence: 0.7 });
  });

  it('ドメイン名は大小無視で照合する', () => {
    const r = buildTrace({ domain: 'State-Machine', implementorsByDomain, graph, specLinks });
    expect(r.matched).toBe(true);
    expect(r.functions).toHaveLength(3);
  });

  it('未検出ドメインは matched=false で空', () => {
    const r = buildTrace({ domain: 'unknown', implementorsByDomain, graph, specLinks });
    expect(r.matched).toBe(false);
    expect(r.functions).toEqual([]);
  });

  it('summary は linkedFunctions / totalImplementors を出す', () => {
    const r = buildTrace({ domain: 'state-machine', implementorsByDomain, graph, specLinks });
    expect(r.summary.functionCount).toBe(3);
    expect(r.summary.linkedFunctions).toBe(3); // 3 関数とも link あり
    expect(r.summary.totalImplementors).toBe(3); // ghost は除外済
    expect(r.summary.truncated).toBe(false);
  });

  it('リンクのある関数を先頭に並べる', () => {
    const links2: AnatomiaSpecLink[] = [
      { from: 'f2', fromName: 'transition', clauseHeading: 'X', clauseFile: '/s.md', confidence: 1, ratified: true },
    ];
    const r = buildTrace({ domain: 'state-machine', implementorsByDomain, graph, specLinks: links2 });
    expect(r.functions[0]!.id).toBe('f2'); // 唯一リンクありが先頭
  });

  it('上限超過は切り詰め + truncated', () => {
    const many: AnatomiaGraph = {
      nodes: Array.from({ length: MAX_TRACE_FUNCTIONS + 5 }, (_, i) => ({
        id: `n${i}`, name: `fn${i}`, kind: 'function', path: `/x/${i}.ts`,
      })),
      edges: [],
    };
    const ids = many.nodes.map((n) => n.id);
    const r = buildTrace({ domain: 'big', implementorsByDomain: { big: ids }, graph: many, specLinks: [] });
    expect(r.functions).toHaveLength(MAX_TRACE_FUNCTIONS);
    expect(r.summary.truncated).toBe(true);
    expect(r.summary.totalImplementors).toBe(MAX_TRACE_FUNCTIONS + 5);
  });
});
