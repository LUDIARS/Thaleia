// 実装コスト軸のエンジン (I/O)。 触るドメインの面積を Anatomia の事実から組み、
// 純粋層 (surface.ts) へ渡す。 日数・金額は出さない (decision-metrics)。

import { domainFanIn, domainSize, missingFor, type ProjectFacts } from '../project-facts.ts';
import { domainSurfaceSize, scoreCost, type DomainSurface } from './surface.ts';
import type { AxisResult, Missing } from '../../initiative/types.ts';
import type { DomainTarget } from '../targets.ts';

export interface CostEngineInput {
  facts: ProjectFacts;
  targets: readonly DomainTarget[];
  /** ドメイン特定で出た missing (LLM 失敗など)。 */
  missing: Missing[];
}

export function evaluateCost(input: CostEngineInput): AxisResult {
  const surfaces: DomainSurface[] = input.targets.map((target) => {
    if (!target.matched) {
      return { domain: target.raw, files: 0, functions: 0, fanIn: 0, isNew: true };
    }
    const size = domainSize(input.facts, target.matched);
    return {
      domain: target.matched,
      files: size.files,
      functions: size.functions,
      fanIn: domainFanIn(input.facts, target.matched),
      isNew: false,
    };
  });

  return scoreCost({
    surfaces,
    medianSurface: medianDomainSurface(input.facts),
    missing: [...input.missing, ...missingFor(input.facts, [
      'anatomia_domains_unavailable',
      'anatomia_domain_view_unavailable',
      'anatomia_graph_unavailable',
      'anatomia_entrypoint_graph_unavailable',
    ])],
  });
}

/** 既存ドメイン面積の中央値。 新規ドメインの見積り (中央値 × 1.5) に使う。 */
export function medianDomainSurface(facts: ProjectFacts): number {
  const sizes = facts.domains
    .map((domain) => {
      const size = domainSize(facts, domain.name);
      return domainSurfaceSize({
        domain: domain.name,
        files: size.files,
        functions: size.functions,
        fanIn: domainFanIn(facts, domain.name),
        isNew: false,
      });
    })
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
  if (sizes.length === 0) return 0;
  const middle = Math.floor(sizes.length / 2);
  if (sizes.length % 2 === 1) return sizes[middle] ?? 0;
  return ((sizes[middle - 1] ?? 0) + (sizes[middle] ?? 0)) / 2;
}
