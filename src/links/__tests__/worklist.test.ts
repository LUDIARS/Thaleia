import { describe, it, expect } from 'vitest';
import { buildLinkWorklist, MAX_WORKLIST_ITEMS } from '../worklist.ts';
import type { AnatomiaGraph } from '../../clients/anatomia-types.ts';
import type { AnatomiaSpecLink } from '../../trace/types.ts';

const graph: AnatomiaGraph = {
  nodes: [{ id: 'f1', name: 'tick', kind: 'function', path: '/src/sm/tick.ts' }],
  edges: [],
};

const links: AnatomiaSpecLink[] = [
  // 批准済 + 高 confidence → 除外。
  { from: 'f1', fromName: 'tick', clauseHeading: 'A', clauseFile: '/s.md', confidence: 0.95, ratified: true },
  // 未批准だが高 confidence → unratified 理由で含む。
  { from: 'f2', fromName: 'fn2', clauseHeading: 'B', clauseFile: '/s.md', confidence: 0.92, ratified: false },
  // 批准済だが低 confidence → low-confidence 理由で含む。
  { from: 'f3', fromName: 'fn3', clauseHeading: 'C', clauseFile: '/s.md', confidence: 0.4, ratified: true },
  // 未批准 + 低 confidence → 両方の理由。
  { from: 'f4', fromName: 'fn4', clauseHeading: 'D', clauseFile: '/s.md', confidence: 0.2, ratified: false },
];

describe('buildLinkWorklist', () => {
  it('未批准 or 低 confidence のみ集める', () => {
    const r = buildLinkWorklist({ specLinks: links, confidenceThreshold: 0.7 });
    expect(r.threshold).toBe(0.7);
    // f1 は除外、 残り 3 件。
    expect(r.items.map((i) => i.fromName).sort()).toEqual(['fn2', 'fn3', 'fn4']);
    expect(r.summary.totalLinks).toBe(4);
    expect(r.summary.flagged).toBe(3);
    expect(r.summary.unratified).toBe(2);
    expect(r.summary.lowConfidence).toBe(2);
  });

  it('未批准を先・confidence 昇順で並べる', () => {
    const r = buildLinkWorklist({ specLinks: links, confidenceThreshold: 0.7 });
    // 未批准 (f4 conf0.2, f2 conf0.92) → 批准済 (f3 conf0.4)。
    expect(r.items.map((i) => i.fromName)).toEqual(['fn4', 'fn2', 'fn3']);
  });

  it('両方該当は reasons に 2 つ', () => {
    const r = buildLinkWorklist({ specLinks: links, confidenceThreshold: 0.7 });
    const f4 = r.items.find((i) => i.fromName === 'fn4')!;
    expect(f4.reasons.sort()).toEqual(['low-confidence', 'unratified']);
  });

  it('graph で from を関数名/パスに解決する', () => {
    const onlyF1: AnatomiaSpecLink[] = [
      { from: 'f1', fromName: 'tick', clauseHeading: 'A', clauseFile: '/s.md', confidence: 0.3, ratified: false },
    ];
    const r = buildLinkWorklist({ specLinks: onlyF1, confidenceThreshold: 0.7, graph });
    expect(r.items[0]!.resolvedName).toBe('tick');
    expect(r.items[0]!.resolvedPath).toBe('/src/sm/tick.ts');
  });

  it('graph に無い from は resolved* が null', () => {
    const r = buildLinkWorklist({ specLinks: links, confidenceThreshold: 0.7 });
    const f4 = r.items.find((i) => i.fromName === 'fn4')!;
    expect(f4.resolvedName).toBeNull();
    expect(f4.resolvedPath).toBeNull();
  });

  it('閾値を下げると低 confidence の網が狭まる', () => {
    const r = buildLinkWorklist({ specLinks: links, confidenceThreshold: 0.3 });
    // conf<0.3 は f4(0.2) のみ。 未批准は f2,f4。 → flagged は f2,f4。
    expect(r.summary.lowConfidence).toBe(1);
    expect(r.items.map((i) => i.fromName).sort()).toEqual(['fn2', 'fn4']);
  });

  it('上限超過は切り詰め + truncated', () => {
    const many: AnatomiaSpecLink[] = Array.from({ length: MAX_WORKLIST_ITEMS + 3 }, (_, i) => ({
      from: `x${i}`, fromName: `x${i}`, clauseHeading: 'h', clauseFile: '/s.md', confidence: 0.1, ratified: false,
    }));
    const r = buildLinkWorklist({ specLinks: many, confidenceThreshold: 0.7 });
    expect(r.items).toHaveLength(MAX_WORKLIST_ITEMS);
    expect(r.summary.flagged).toBe(MAX_WORKLIST_ITEMS + 3);
    expect(r.summary.shown).toBe(MAX_WORKLIST_ITEMS);
    expect(r.summary.truncated).toBe(true);
  });
});
