// トレースエンジン — Anatomia から実装アンカー + graph + spec-links を取得 → 純粋関数で組む。

import { buildTrace } from './build.ts';
import type { TraceResult } from './types.ts';
import type { AnatomiaClient } from '../clients/anatomia.ts';

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
