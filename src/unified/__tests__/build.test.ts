import { describe, expect, it } from 'vitest';
import { buildUnifiedView } from '../build.ts';
import type { AnatomiaGraph } from '../../relay/types.ts';
import type { AnatomiaSpecLink } from '../../trace/types.ts';

const graph: AnatomiaGraph = {
  nodes: [
    { id: 'move', name: 'movePlayer', kind: 'function', path: '/src/player.ts' },
    { id: 'spawn', name: 'spawnEnemy', kind: 'function', path: '/src/enemy.ts' },
  ],
  edges: [],
};

const specLinks: AnatomiaSpecLink[] = [
  {
    from: 'move',
    fromName: 'movePlayer',
    clauseHeading: 'Player movement',
    clauseFile: '/spec/player.md',
    confidence: 0.91,
    ratified: true,
  },
  {
    from: '/src/enemy.ts',
    fromName: 'enemy file',
    clauseHeading: 'Enemy spawn',
    clauseFile: '/spec/enemy.md',
    confidence: 0.66,
    ratified: false,
  },
];

describe('buildUnifiedView', () => {
  it('builds an Anatomia-only view from domain-view and spec-links', () => {
    const result = buildUnifiedView({
      project: 'game',
      pfProject: null,
      anatomiaProject: 'game',
      anatomiaDomains: ['player', 'enemy'],
      implementorsByDomain: { player: ['move'], enemy: ['spawn'] },
      graph,
      specLinks,
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.mode).toBe('anatomia-only');
    expect(result.domains).toHaveLength(2);
    expect(result.domains.find((d) => d.domain === 'player')).toMatchObject({
      status: 'anatomia-only',
      implementorCount: 1,
    });
    expect(result.specs.filter((s) => s.source === 'anatomia-link')).toHaveLength(2);
    expect(result.summary.linkedFunctions).toBe(2);
  });

  it('integrates Praeforma saved specs with Anatomia implementors', () => {
    const result = buildUnifiedView({
      project: 'game',
      pfProject: 'pf-game',
      anatomiaProject: 'an-game',
      pfDomains: [
        { id: 'd-player', name: 'Player' },
        { id: 'd-inventory', name: 'Inventory' },
      ],
      pfSpecs: [
        {
          id: 's1',
          code: 'SPEC-001-PLAYER-MOVE',
          title: 'Player can move',
          status: 'draft',
          priority: 'must',
          targetDomains: ['Player'],
        },
        {
          id: 's2',
          code: 'SPEC-002-INVENTORY',
          title: 'Inventory exists',
          targetDomains: ['Inventory'],
        },
      ],
      anatomiaDomains: ['player', 'enemy'],
      implementorsByDomain: { player: ['move'], enemy: ['spawn'] },
      graph,
      specLinks,
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.mode).toBe('integrated');
    expect(result.domains.find((d) => d.domain === 'player')).toMatchObject({ source: 'both', status: 'covered' });
    expect(result.domains.find((d) => d.domain === 'Inventory')).toMatchObject({ source: 'praeforma', status: 'spec-only' });
    expect(result.domains.find((d) => d.domain === 'enemy')).toMatchObject({ source: 'anatomia', status: 'code-only' });
    expect(result.specs.find((s) => s.code === 'SPEC-001-PLAYER-MOVE')).toMatchObject({ implemented: true });
    expect(result.specs.find((s) => s.code === 'SPEC-002-INVENTORY')).toMatchObject({ implemented: false });
    expect(result.summary).toMatchObject({ praeformaSpecs: 2, coveredDomains: 1, specOnlyDomains: 1, codeOnlyDomains: 1 });
  });
});
