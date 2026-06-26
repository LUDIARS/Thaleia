// 突合エンジン — 上流から取得 → 中立モデルへ正規化 → reconcile() → 打刻。

import type { PfSpec, ReconcileResult } from './types.ts';
import { reconcile } from './match.ts';
import { semanticMatch } from './semantic.ts';
import type { ClaudeRunner } from '../llm/claude.ts';
import type { PraeformaClient } from '../clients/praeforma.ts';
import type { AnatomiaClient } from '../clients/anatomia.ts';

export interface ReconcileParams {
  /** 突合スナップショットの表示名。 */
  label: string;
  /** Praeforma の project id。 */
  pfProjectId: string;
  /** Anatomia の project id (= 解析登録名)。 */
  anatomiaProject: string;
  /** ISO timestamp (呼び出し側が供給)。 */
  now: string;
  /** 指定時、 字面で外れた未対応を LLM で意味照合する (opt-in)。 未指定なら字面のみ。 */
  semanticRunner?: ClaudeRunner;
}

/** Praeforma(仕様) と Anatomia(実装) を突合する。 */
export async function runReconcile(
  pf: PraeformaClient,
  an: AnatomiaClient,
  params: ReconcileParams,
): Promise<ReconcileResult> {
  const pfDomains = await pf.listDomains(params.pfProjectId);
  const pfLayouts = await pf.listLayouts(params.pfProjectId);
  const domainIdToName = new Map(pfDomains.map((d) => [d.id, d.name]));
  const layoutIdToName = new Map(pfLayouts.map((l) => [l.id, l.name]));

  const specRows = await pf.listSpecs(params.pfProjectId);
  const pfSpecs: PfSpec[] = [];
  for (const s of specRows) {
    const targets = await pf.getSpecTargets(params.pfProjectId, s.id);
    // kind==='domain' → ドメイン名、 kind==='layout' → シーン名に解決。
    const targetDomains = targets
      .filter((t) => t.kind === 'domain')
      .map((t) => domainIdToName.get(t.refId))
      .filter((x): x is string => Boolean(x));
    const targetScenes = targets
      .filter((t) => t.kind === 'layout')
      .map((t) => layoutIdToName.get(t.refId))
      .filter((x): x is string => Boolean(x));
    pfSpecs.push({
      id: s.id,
      code: s.code,
      title: s.title,
      status: s.status,
      priority: s.priority,
      targetDomains,
      targetScenes,
    });
  }

  const anatomiaDomains = await an.listDomains(params.anatomiaProject);
  const anatomiaScreens = await an.listScreens(params.anatomiaProject);

  const baseInput = {
    project: params.label,
    pfProjectId: params.pfProjectId,
    anatomiaProject: params.anatomiaProject,
    pfDomains,
    pfSpecs,
    anatomiaDomains,
    pfLayouts,
    anatomiaScreens,
  };

  // 意味照合 (opt-in): まず字面で突合 → 未対応の両側を LLM で意味照合 → alias を渡して再突合。
  if (params.semanticRunner) {
    const structural = reconcile(baseInput);
    const specOnlyDomains = structural.domainMatches
      .filter((m) => m.status === 'spec-only')
      .map((m) => m.pfDomain!)
      .filter(Boolean);
    const specOnlyScenes = structural.sceneMatches
      .filter((m) => m.status === 'spec-only')
      .map((m) => m.pfScene!)
      .filter(Boolean);
    const [domainAliases, sceneAliases] = await Promise.all([
      semanticMatch(specOnlyDomains, structural.gaps.codeDomainsWithoutSpec, 'ドメイン', params.semanticRunner),
      semanticMatch(specOnlyScenes, structural.gaps.codeScreensWithoutSpec, 'シーン', params.semanticRunner),
    ]);
    if (domainAliases.length > 0 || sceneAliases.length > 0) {
      const merged = reconcile({ ...baseInput, domainAliases, sceneAliases });
      return { ...merged, generatedAt: params.now };
    }
    return { ...structural, generatedAt: params.now };
  }

  const result = reconcile(baseInput);
  return { ...result, generatedAt: params.now };
}
