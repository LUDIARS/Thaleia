import { normalizeName } from '../reconcile/match.ts';
import type { AnatomiaGraph } from '../relay/types.ts';
import type { AnatomiaSpecLink } from '../trace/types.ts';
import type { PfSpecRow } from '../clients/praeforma.ts';
import type { PfDomain } from '../reconcile/types.ts';
import type {
  UnifiedDomainView,
  UnifiedFunctionRef,
  UnifiedSpecLinkRef,
  UnifiedSpecView,
  UnifiedView,
} from './types.ts';

export interface BuildUnifiedViewParams {
  project: string;
  pfProject: string | null;
  anatomiaProject: string;
  pfDomains?: PfDomain[];
  pfSpecs?: Array<PfSpecRow & { targetDomains: string[] }>;
  anatomiaDomains: string[];
  implementorsByDomain: Record<string, string[]>;
  graph: AnatomiaGraph;
  specLinks: AnatomiaSpecLink[];
  warnings?: string[];
  generatedAt?: string;
}

interface FunctionWithDomain extends UnifiedFunctionRef {
  domain: string;
}

export function buildUnifiedView(params: BuildUnifiedViewParams): UnifiedView {
  const nodeById = new Map(params.graph.nodes.map((n) => [n.id, n]));
  const linksByFrom = groupSpecLinks(params.specLinks);
  const pfDomainsByNorm = new Map((params.pfDomains ?? []).map((d) => [normalizeName(d.name), d]));
  const pfSpecs = params.pfSpecs ?? [];
  const pfSpecsByDomain = groupPfSpecsByDomain(pfSpecs);
  const functionDomains = new Map<string, string[]>();
  const functionRefsByDomain = new Map<string, UnifiedFunctionRef[]>();
  const specLinksByDomain = new Map<string, UnifiedSpecLinkRef[]>();
  const allLinkedFunctions = new Map<string, FunctionWithDomain>();

  for (const [domain, ids] of Object.entries(params.implementorsByDomain)) {
    const functions: UnifiedFunctionRef[] = [];
    const domainSpecLinks = new Map<string, UnifiedSpecLinkRef>();
    for (const id of ids) {
      const node = nodeById.get(id);
      if (!node) continue;
      const fn = { id, name: node.name, path: node.path };
      functions.push(fn);
      allLinkedFunctions.set(id, { ...fn, domain });
      const domains = functionDomains.get(id) ?? [];
      domains.push(domain);
      functionDomains.set(id, domains);
      for (const link of linksForNode(linksByFrom, id, node.path)) {
        domainSpecLinks.set(specLinkKey(link), toSpecLinkRef(link));
      }
    }
    functions.sort(sortFunctionRef);
    functionRefsByDomain.set(domain, functions);
    specLinksByDomain.set(domain, [...domainSpecLinks.values()].sort(sortSpecLinkRef));
  }

  const anatomiaDomainNames = new Set([
    ...params.anatomiaDomains,
    ...Object.keys(params.implementorsByDomain),
  ]);
  const allDomainKeys = new Map<string, string>();
  for (const name of anatomiaDomainNames) allDomainKeys.set(normalizeName(name), name);
  for (const d of params.pfDomains ?? []) {
    if (!allDomainKeys.has(normalizeName(d.name))) allDomainKeys.set(normalizeName(d.name), d.name);
  }

  const domains: UnifiedDomainView[] = [...allDomainKeys.values()]
    .sort((a, b) => a.localeCompare(b))
    .map((domain) => {
      const norm = normalizeName(domain);
      const pfDomain = pfDomainsByNorm.get(norm);
      const anDomain = findByNormalized(anatomiaDomainNames, domain);
      const functions = functionRefsByDomain.get(anDomain ?? domain) ?? [];
      const domainSpecs = pfSpecsByDomain.get(norm) ?? [];
      const source = pfDomain && anDomain ? 'both' : pfDomain ? 'praeforma' : 'anatomia';
      const status =
        pfDomain && functions.length > 0
          ? 'covered'
          : pfDomain
            ? 'spec-only'
            : params.pfProject
              ? 'code-only'
              : 'anatomia-only';
      return {
        domain,
        source,
        implementorCount: functions.length,
        functions,
        specLinks: specLinksByDomain.get(anDomain ?? domain) ?? [],
        praeformaSpecs: domainSpecs.map((s) => ({
          key: `pf:${s.id}`,
          code: s.code,
          title: s.title,
          status: s.status,
          priority: s.priority,
        })),
        status,
      };
    });

  const specs = [
    ...pfSpecs.map<UnifiedSpecView>((s) => {
      const linked = linkedFunctionsForDomains(s.targetDomains, functionRefsByDomain);
      return {
        key: `pf:${s.id}`,
        source: 'praeforma',
        code: s.code,
        title: s.title,
        clauseFile: null,
        status: s.status,
        priority: s.priority,
        targetDomains: uniqueNormalized(s.targetDomains),
        linkedDomains: uniqueNormalized(s.targetDomains.filter((d) => (functionRefsByDomain.get(d) ?? []).length > 0)),
        linkedFunctions: linked,
        implemented: linked.length > 0,
      };
    }),
    ...buildAnatomiaSpecViews(params.specLinks, linksByFrom, nodeById, functionDomains),
  ].sort((a, b) => a.source.localeCompare(b.source) || (a.code ?? a.title).localeCompare(b.code ?? b.title));

  const summary = {
    domains: domains.length,
    specs: specs.length,
    praeformaSpecs: pfSpecs.length,
    anatomiaSpecClauses: specs.filter((s) => s.source === 'anatomia-link').length,
    coveredDomains: domains.filter((d) => d.status === 'covered').length,
    specOnlyDomains: domains.filter((d) => d.status === 'spec-only').length,
    codeOnlyDomains: domains.filter((d) => d.status === 'code-only').length,
    linkedFunctions: new Set(specs.flatMap((s) => s.linkedFunctions.map((f) => f.id))).size,
  };

  return {
    project: params.project,
    pfProject: params.pfProject,
    anatomiaProject: params.anatomiaProject,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    mode: params.pfProject && pfSpecs.length > 0 ? 'integrated' : 'anatomia-only',
    warnings: params.warnings ?? [],
    domains,
    specs,
    summary,
  };
}

function groupSpecLinks(specLinks: AnatomiaSpecLink[]): Map<string, AnatomiaSpecLink[]> {
  const out = new Map<string, AnatomiaSpecLink[]>();
  for (const link of specLinks) {
    const arr = out.get(link.from) ?? [];
    arr.push(link);
    out.set(link.from, arr);
  }
  return out;
}

function linksForNode(
  linksByFrom: Map<string, AnatomiaSpecLink[]>,
  id: string,
  path: string,
): AnatomiaSpecLink[] {
  const seen = new Set<string>();
  const out: AnatomiaSpecLink[] = [];
  for (const link of [...(linksByFrom.get(id) ?? []), ...(path ? linksByFrom.get(path) ?? [] : [])]) {
    const key = specLinkKey(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

function groupPfSpecsByDomain(specs: Array<PfSpecRow & { targetDomains: string[] }>) {
  const out = new Map<string, Array<PfSpecRow & { targetDomains: string[] }>>();
  for (const spec of specs) {
    for (const domain of spec.targetDomains) {
      const key = normalizeName(domain);
      const arr = out.get(key) ?? [];
      arr.push(spec);
      out.set(key, arr);
    }
  }
  return out;
}

function buildAnatomiaSpecViews(
  specLinks: AnatomiaSpecLink[],
  linksByFrom: Map<string, AnatomiaSpecLink[]>,
  nodeById: Map<string, AnatomiaGraph['nodes'][number]>,
  functionDomains: Map<string, string[]>,
): UnifiedSpecView[] {
  const byClause = new Map<string, AnatomiaSpecLink[]>();
  for (const link of specLinks) {
    const arr = byClause.get(specLinkKey(link)) ?? [];
    arr.push(link);
    byClause.set(specLinkKey(link), arr);
  }

  return [...byClause.entries()].map(([key, links]) => {
    const linkedFunctions = new Map<string, FunctionWithDomain>();
    const linkedDomains = new Set<string>();
    for (const link of links) {
      const direct = nodeById.get(link.from);
      if (direct) {
        linkedFunctions.set(direct.id, { id: direct.id, name: direct.name, path: direct.path, domain: '' });
        for (const d of functionDomains.get(direct.id) ?? []) linkedDomains.add(d);
      }
      for (const [id, node] of nodeById) {
        if (node.path !== link.from) continue;
        linkedFunctions.set(id, { id, name: node.name, path: node.path, domain: '' });
        for (const d of functionDomains.get(id) ?? []) linkedDomains.add(d);
      }
    }
    const first = links[0]!;
    const fns = [...linkedFunctions.values()].sort(sortFunctionRef);
    return {
      key: `an:${key}`,
      source: 'anatomia-link',
      code: null,
      title: first.clauseHeading,
      clauseFile: first.clauseFile,
      targetDomains: [],
      linkedDomains: [...linkedDomains].sort((a, b) => a.localeCompare(b)),
      linkedFunctions: fns,
      implemented: fns.length > 0,
    };
  });
}

function linkedFunctionsForDomains(
  domains: string[],
  functionRefsByDomain: Map<string, UnifiedFunctionRef[]>,
): UnifiedFunctionRef[] {
  const out = new Map<string, UnifiedFunctionRef>();
  for (const domain of domains) {
    for (const [actualDomain, functions] of functionRefsByDomain) {
      if (normalizeName(actualDomain) !== normalizeName(domain)) continue;
      for (const fn of functions) out.set(fn.id, fn);
    }
  }
  return [...out.values()].sort(sortFunctionRef);
}

function findByNormalized(names: Iterable<string>, wanted: string): string | null {
  const key = normalizeName(wanted);
  for (const name of names) {
    if (normalizeName(name) === key) return name;
  }
  return null;
}

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeName(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function specLinkKey(link: AnatomiaSpecLink): string {
  return `${link.clauseFile}|${link.clauseHeading}`;
}

function toSpecLinkRef(link: AnatomiaSpecLink): UnifiedSpecLinkRef {
  return {
    clauseHeading: link.clauseHeading,
    clauseFile: link.clauseFile,
    confidence: link.confidence,
    ratified: link.ratified,
  };
}

function sortFunctionRef(a: UnifiedFunctionRef, b: UnifiedFunctionRef): number {
  return a.name.localeCompare(b.name) || a.path.localeCompare(b.path) || a.id.localeCompare(b.id);
}

function sortSpecLinkRef(a: UnifiedSpecLinkRef, b: UnifiedSpecLinkRef): number {
  return b.confidence - a.confidence || a.clauseFile.localeCompare(b.clauseFile) || a.clauseHeading.localeCompare(b.clauseHeading);
}
