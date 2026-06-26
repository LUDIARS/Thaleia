// トレースエンジン — Anatomia から実装アンカー + graph + spec-links を取得 → 純粋関数で組む。

import { buildTrace, buildSpecTrace } from './build.ts';
import type { SpecTraceResult, TraceResult } from './types.ts';
import type { AnatomiaClient } from '../clients/anatomia.ts';
import type { PraeformaClient } from '../clients/praeforma.ts';

export interface TraceParams {
  project: string;
  domain: string;
  maxFunctions?: number;
}

/** 対象ドメインの関数粒度トレース (実装関数 + spec-links) を返す。 Anatomia のみ呼ぶ。 */
export async function runTrace(an: AnatomiaClient, params: TraceParams): Promise<TraceResult> {
  const [implementorsByDomain, graph, specLinks] = await Promise.all([
    an.listDomainImplementors(params.project),
    an.fetchGraph(params.project),
    an.listSpecLinks(params.project),
  ]);
  return buildTrace({
    domain: params.domain,
    implementorsByDomain,
    graph,
    specLinks,
    maxFunctions: params.maxFunctions,
  });
}

export interface SpecTraceParams {
  /** Praeforma の project id (spec / target ドメイン解決に使う)。 */
  pfProject: string;
  /** Anatomia の project id (実装アンカー / graph / spec-links 解決に使う)。 */
  anatomiaProject: string;
  /** Pf spec の code。 */
  specCode: string;
  maxFunctions?: number;
}

/**
 * Pf spec 起点の関数粒度トレース。 Pf で spec→target ドメインを解決し、
 * Anatomia で各ドメインの実装関数 + spec-links を引いて束ねる。
 *
 * spec code が Pf に見つからなければ null を返す (route 側で 404)。
 */
export async function runSpecTrace(
  pf: PraeformaClient,
  an: AnatomiaClient,
  params: SpecTraceParams,
): Promise<SpecTraceResult | null> {
  const specRows = await pf.listSpecs(params.pfProject);
  const spec = specRows.find((s) => s.code === params.specCode);
  if (!spec) return null;

  // spec の target を Pf のドメイン名へ解決 (kind==='domain' のみ。 layout は実装関数を持たない)。
  const [targets, pfDomains] = await Promise.all([
    pf.getSpecTargets(params.pfProject, spec.id),
    pf.listDomains(params.pfProject),
  ]);
  const domainIdToName = new Map(pfDomains.map((d) => [d.id, d.name]));
  const targetDomains = targets
    .filter((t) => t.kind === 'domain')
    .map((t) => domainIdToName.get(t.refId))
    .filter((x): x is string => Boolean(x));

  const [implementorsByDomain, graph, specLinks] = await Promise.all([
    an.listDomainImplementors(params.anatomiaProject),
    an.fetchGraph(params.anatomiaProject),
    an.listSpecLinks(params.anatomiaProject),
  ]);

  return buildSpecTrace({
    specCode: spec.code,
    specTitle: spec.title,
    targetDomains,
    implementorsByDomain,
    graph,
    specLinks,
    maxFunctions: params.maxFunctions,
  });
}
