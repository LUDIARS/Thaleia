// 突合エンジン — 上流から取得 → 中立モデルへ正規化 → reconcile() → 打刻。

import type { PfSpec, ReconcileResult } from './types.ts';
import { reconcile } from './match.ts';
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
}

/** Praeforma(仕様) と Anatomia(実装) を突合する。 */
export async function runReconcile(
  pf: PraeformaClient,
  an: AnatomiaClient,
  params: ReconcileParams,
): Promise<ReconcileResult> {
  const pfDomains = await pf.listDomains(params.pfProjectId);
  const idToName = new Map(pfDomains.map((d) => [d.id, d.name]));

  const specRows = await pf.listSpecs(params.pfProjectId);
  const pfSpecs: PfSpec[] = [];
  for (const s of specRows) {
    const targets = await pf.getSpecTargets(params.pfProjectId, s.id);
    // kind==='domain' の target を ドメイン名に解決 ('layout'=scene は v1 対象外)。
    const targetDomains = targets
      .filter((t) => t.kind === 'domain')
      .map((t) => idToName.get(t.refId))
      .filter((x): x is string => Boolean(x));
    pfSpecs.push({
      id: s.id,
      code: s.code,
      title: s.title,
      status: s.status,
      priority: s.priority,
      targetDomains,
    });
  }

  const anatomiaDomains = await an.listDomains(params.anatomiaProject);

  const result = reconcile({
    project: params.label,
    pfProjectId: params.pfProjectId,
    anatomiaProject: params.anatomiaProject,
    pfDomains,
    pfSpecs,
    anatomiaDomains,
  });
  return { ...result, generatedAt: params.now };
}
