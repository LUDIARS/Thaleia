import { describe, expect, it } from 'vitest';
import { domainFanIn, missingFor, type ProjectFacts } from '../project-facts.ts';

function facts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    domains: [],
    implementorsByDomain: {},
    graph: null,
    entrypointGraph: null,
    hotspots: null,
    businessDomains: null,
    programDomainView: null,
    specLinks: null,
    modules: null,
    missing: [],
    ...overrides,
  };
}

describe('project facts consumers', () => {
  it('空の entrypoint graph で full graph の fan-in を隠さない', () => {
    const input = facts({
      implementorsByDomain: { evaluation: ['inside'] },
      entrypointGraph: { entries: [], nodes: [], edges: [] },
      graph: {
        nodes: [],
        edges: [{ from: 'outside', to: 'inside', kind: 'calls' }],
      },
    });

    expect(domainFanIn(input, 'evaluation')).toBe(1);
  });

  it('軸が使わない endpoint の失敗を confidence 用 missing に混ぜない', () => {
    const input = facts({
      missing: [
        { code: 'anatomia_modules_unavailable', reason: 'anatomia_modules_unavailable の取得に失敗した (Error)' },
        { code: 'anatomia_graph_unavailable', reason: 'anatomia_graph_unavailable の取得に失敗した (Error)' },
      ],
    });

    expect(missingFor(input, ['anatomia_graph_unavailable'])).toEqual([
      { code: 'anatomia_graph_unavailable', reason: 'anatomia_graph_unavailable の取得に失敗した (Error)' },
    ]);
  });
});
