import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../../../config.ts';
import type { EvaluationContext } from '../../context.ts';
import type { ProjectFacts } from '../../project-facts.ts';
import { buildLayerStatuses, evaluateDomain } from '../engine.ts';

function facts(): ProjectFacts {
  return {
    domains: [{ name: 'A', implementorCount: 1 }],
    implementorsByDomain: { A: ['symbol-a'] },
    graph: { nodes: [], edges: [] },
    entrypointGraph: { entries: [], nodes: [], edges: [] },
    hotspots: [],
    businessDomains: [{
      id: 'business-a',
      name: 'A',
      status: 'implemented',
      programDomains: [{ programDomainId: 'B', weight: 1 }],
      specRefCount: 1,
    }],
    programDomainView: {
      domains: [
        { id: 'A', layer: 'application', moduleCount: 1, codeSymbolCount: 1, misfitCount: 0, businessDomains: [] },
        { id: 'B', layer: 'application', moduleCount: 1, codeSymbolCount: 1, misfitCount: 0, businessDomains: [{ businessDomainId: 'business-a', weight: 1 }] },
      ],
      proposals: [],
      modularity: 1,
    },
    specLinks: [],
    modules: [],
    missing: [],
  };
}

describe('buildLayerStatuses', () => {
  it('別のプログラムドメインへのリンクで対象ペアを整合扱いしない', () => {
    const [status] = buildLayerStatuses(facts(), [{ raw: 'A', matched: 'A' }]);
    expect(status?.inBusinessLayer).toBe(true);
    expect(status?.inProgramLayer).toBe(true);
    expect(status?.linked).toBe(false);
  });
});

describe('evaluateDomain', () => {
  it('inactive なテストだけなら full safety の登録数を 0 として危険度を上限にする', async () => {
    const projectFacts = facts();
    const context = {
      initiative: {
        id: 'initiative-1', title: '改善', kind: 'improvement', project: 'project', body: '本文',
        repoPath: 'C:/repo', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z',
      },
      deps: {
        config: { weights: DEFAULT_WEIGHTS },
        augur: {
          reviewPlan: async () => ({ stages: [{ id: 'spec_requirements', run: true, reason: 'full' }], testCases: [] }),
          listTests: async () => [{
            id: 'archived-1', name: 'old', kind: 'unit', status: 'archived',
            domains: { business: ['A'], program: [] },
          }],
        },
      },
    } as unknown as EvaluationContext;

    const result = await evaluateDomain({
      context,
      facts: projectFacts,
      targets: [{ raw: 'A', matched: 'A' }],
      missing: [],
    });

    expect(result.degrade?.risk).toBe(1);
    expect(result.degrade?.repayFirst[0]?.label).toContain('1 件も登録されていない');
  });
});
