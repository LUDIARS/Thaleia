import { describe, it, expect } from 'vitest';
import { selectRelayGraph, MAX_RELAY_NODES } from '../select.ts';
import type { AnatomiaGraph } from '../types.ts';

const graph: AnatomiaGraph = {
  nodes: [
    { id: 'a1', name: 'movePlayer', kind: 'function', path: '/src/player/move.ts' },
    { id: 'a2', name: 'applyVelocity', kind: 'function', path: '/src/player/physics.ts' },
    { id: 'a3', name: 'spawnEnemy', kind: 'function', path: '/src/enemy/spawn.ts' },
    { id: 'a4', name: 'PlayerConfig', kind: 'file', path: '/src/player/config.ts' },
  ],
  edges: [
    { from: 'a1', to: 'a2', kind: 'calls' },
    { from: 'a1', to: 'a3', kind: 'calls' }, // a3 はアンカー外 → 落ちる
    { from: 'a2', to: 'a4', kind: 'reads' },
  ],
};

const implementorsByDomain = { Player: ['a1', 'a2', 'a4'], Enemy: ['a3'] };

describe('selectRelayGraph', () => {
  it('domain アンカーで部分グラフを切り出し、 内部エッジだけ残す', () => {
    const r = selectRelayGraph({
      graph,
      implementorsByDomain,
      target: { kind: 'domain', name: 'Player' },
    });
    expect(r.nodes.map((n) => n.key).sort()).toEqual(['a1', 'a2', 'a4']);
    // a1->a3 はアンカー外を指すので除外。 a1->a2(calls), a2->a4(reads→related)。
    expect(r.edges).toEqual([
      { from: 'a1', to: 'a2', relation: 'calls' },
      { from: 'a2', to: 'a4', relation: 'related' },
    ]);
  });

  it('ドメイン名は大文字小文字を無視して照合する', () => {
    const r = selectRelayGraph({
      graph,
      implementorsByDomain,
      target: { kind: 'domain', name: 'player' },
    });
    expect(r.nodes).toHaveLength(3);
  });

  it('node 種別を Praeforma の GraphNodeType へ正規化する (file 以外は symbol)', () => {
    const r = selectRelayGraph({
      graph,
      implementorsByDomain,
      target: { kind: 'domain', name: 'Player' },
    });
    expect(r.nodes.find((n) => n.key === 'a4')?.type).toBe('file');
    expect(r.nodes.find((n) => n.key === 'a1')?.type).toBe('symbol');
    expect(r.nodes.find((n) => n.key === 'a1')?.anatomia_ref).toEqual({
      path: '/src/player/move.ts',
      symbol: 'movePlayer',
      kind: 'function',
    });
  });

  it('検索語を name/path に当ててアンカーへ和集合する', () => {
    const r = selectRelayGraph({
      graph,
      implementorsByDomain,
      target: { kind: 'layout', name: 'なし' },
      query: 'enemy spawn',
    });
    expect(r.nodes.map((n) => n.key)).toEqual(['a3']);
  });

  it('ドメイン未検出は空 + 理由を summary に明示する (mock 禁止)', () => {
    const r = selectRelayGraph({
      graph,
      implementorsByDomain,
      target: { kind: 'domain', name: 'Unknown' },
    });
    expect(r.nodes).toHaveLength(0);
    expect(r.edges).toHaveLength(0);
    expect(r.summary).toContain('検出ドメインに無し');
  });

  it('上限超過は切り詰め、 summary に明示する', () => {
    const many: AnatomiaGraph = {
      nodes: Array.from({ length: MAX_RELAY_NODES + 10 }, (_, i) => ({
        id: `n${i}`,
        name: `fn${i}`,
        kind: 'function',
        path: `/src/x/${i}.ts`,
      })),
      edges: [],
    };
    const ids = many.nodes.map((n) => n.id);
    const r = selectRelayGraph({
      graph: many,
      implementorsByDomain: { Big: ids },
      target: { kind: 'domain', name: 'Big' },
    });
    expect(r.nodes).toHaveLength(MAX_RELAY_NODES);
    expect(r.summary).toContain('切り詰め');
  });
});
