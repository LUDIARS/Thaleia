import type { AnatomiaClient } from '../clients/anatomia.ts';
import type { PraeformaClient } from '../clients/praeforma.ts';
import { buildUnifiedView } from './build.ts';
import type { UnifiedView } from './types.ts';

export interface RunUnifiedViewParams {
  project: string;
  anatomiaProject: string;
  pfProject?: string | null;
}

export async function runUnifiedView(
  an: AnatomiaClient,
  params: RunUnifiedViewParams,
  pf?: PraeformaClient | null,
): Promise<UnifiedView> {
  const [anatomiaDomains, implementorsByDomain, graph, specLinks] = await Promise.all([
    an.listDomains(params.anatomiaProject),
    an.listDomainImplementors(params.anatomiaProject),
    an.fetchGraph(params.anatomiaProject),
    an.listSpecLinks(params.anatomiaProject),
  ]);

  const warnings: string[] = [];
  let pfDomains = undefined;
  let pfSpecs = undefined;
  if (params.pfProject && pf) {
    const domains = await pf.listDomains(params.pfProject);
    const specs = await loadPfSpecsWithTargets(pf, params.pfProject, domains);
    pfDomains = domains;
    pfSpecs = specs;
  } else if (params.pfProject && !pf) {
    warnings.push('praeforma_unconfigured');
  }

  return buildUnifiedView({
    project: params.project,
    pfProject: params.pfProject ?? null,
    anatomiaProject: params.anatomiaProject,
    pfDomains,
    pfSpecs,
    anatomiaDomains: anatomiaDomains.map((d) => d.name),
    implementorsByDomain,
    graph,
    specLinks,
    warnings,
  });
}

async function loadPfSpecsWithTargets(
  pf: PraeformaClient,
  pfProject: string,
  domains: Awaited<ReturnType<PraeformaClient['listDomains']>>,
) {
  const specs = await pf.listSpecs(pfProject);
  const domainNameById = new Map(domains.map((d) => [d.id, d.name]));
  return Promise.all(
    specs.map(async (spec) => {
      const targets = await pf.getSpecTargets(pfProject, spec.id);
      const targetDomains = targets
        .filter((t) => t.kind === 'domain')
        .map((t) => domainNameById.get(t.refId))
        .filter((x): x is string => Boolean(x));
      return { ...spec, targetDomains };
    }),
  );
}
