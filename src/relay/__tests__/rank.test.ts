import { describe, it, expect, vi } from 'vitest';
import { rankRelayResult, buildRankPrompt } from '../rank.ts';
import type { RelayResult } from '../types.ts';

const base: RelayResult = {
  nodes: [
    { key: 'k1', label: 'movePlayer', type: 'symbol', anatomia_ref: { path: '/p/move.ts' } },
    { key: 'k2', label: 'applyVelocity', type: 'symbol', anatomia_ref: { path: '/p/phys.ts' } },
    { key: 'k3', label: 'render', type: 'symbol', anatomia_ref: { path: '/r/draw.ts' } },
  ],
  edges: [
    { from: 'k1', to: 'k2', relation: 'calls' },
    { from: 'k2', to: 'k3', relation: 'calls' },
  ],
  summary: '構造選択 3 件',
};

const ctx = { target: { kind: 'domain' as const, name: 'Player' }, requirements: [], topK: 2 };

describe('rankRelayResult', () => {
  it('LLM が選んだ key 順に絞り、 残ノード間のエッジだけ残す', async () => {
    const run = vi.fn(async () => '{"keys":["k2","k1"]}');
    const r = await rankRelayResult(base, ctx, run);
    expect(run).toHaveBeenCalledOnce();
    expect(r.nodes.map((n) => n.key)).toEqual(['k2', 'k1']); // LLM 順を保持
    expect(r.edges).toEqual([{ from: 'k1', to: 'k2', relation: 'calls' }]); // k3 落ちで k2->k3 除外
    expect(r.summary).toContain('3→2 件に絞り込み');
  });

  it('候補に無い key / 重複は捨てる', async () => {
    const run = vi.fn(async () => '{"keys":["k1","k1","ghost","k3"]}');
    const r = await rankRelayResult(base, ctx, run);
    expect(r.nodes.map((n) => n.key)).toEqual(['k1', 'k3']);
  });

  it('topK を超えて選ばれても上限で切る', async () => {
    const run = vi.fn(async () => '{"keys":["k1","k2","k3"]}');
    const r = await rankRelayResult(base, { ...ctx, topK: 2 }, run);
    expect(r.nodes).toHaveLength(2);
  });

  it('候補が空なら LLM を呼ばずそのまま返す', async () => {
    const run = vi.fn(async () => '{"keys":[]}');
    const empty: RelayResult = { nodes: [], edges: [], summary: '空' };
    const r = await rankRelayResult(empty, ctx, run);
    expect(run).not.toHaveBeenCalled();
    expect(r).toBe(empty);
  });

  it('プロンプトに候補 key と要件・検索意図が載る', () => {
    const p = buildRankPrompt(base.nodes, {
      target: { kind: 'domain', name: 'Player' },
      requirements: [{ code: 'R1', title: '移動', acceptance: ['WASDで動く'] }],
      query: '移動処理',
      topK: 2,
    });
    expect(p).toContain('k1: movePlayer');
    expect(p).toContain('R1 移動');
    expect(p).toContain('WASDで動く');
    expect(p).toContain('移動処理');
    expect(p).toContain('最大 2 件');
  });
});
