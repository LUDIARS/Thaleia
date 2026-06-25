// /reconcile — 突合の実行 + 取得 + 簡易ビューア。
//
// POST /reconcile  { label, pf_project, anatomia_project } -> ReconcileResult (保存)
// GET  /reconcile?project=<label>                          -> 最新スナップショット (無ければ 404)
// GET  /                                                   -> 最小 HTML ビューア

import type { Hono } from 'hono';
import type { ThaleiaConfig } from '../config.ts';
import type { SnapshotStore } from '../store/snapshot.ts';
import { makePraeformaClient } from '../clients/praeforma.ts';
import { makeAnatomiaClient } from '../clients/anatomia.ts';
import { runReconcile } from '../reconcile/engine.ts';
import { VIEWER_HTML } from './viewer.ts';

export function mountReconcileRoutes(app: Hono, config: ThaleiaConfig, store: SnapshotStore): void {
  app.post('/reconcile', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { label?: string; pf_project?: string; anatomia_project?: string }
      | null;
    const label = body?.label?.trim();
    const pfProject = body?.pf_project?.trim();
    const anatomiaProject = body?.anatomia_project?.trim() || pfProject;
    if (!label || !pfProject) {
      return c.json({ error: 'label と pf_project は必須です' }, 400);
    }
    // 上流未設定は mock に落とさず明示エラー (無言 fallback 禁止)。
    if (!config.praeformaBaseUrl) {
      return c.json({ error: 'praeforma_unconfigured', hint: 'PRAEFORMA_BASE_URL を設定してください' }, 503);
    }
    if (!config.anatomiaBaseUrl) {
      return c.json({ error: 'anatomia_unconfigured', hint: 'ANATOMIA_BASE_URL を設定してください' }, 503);
    }
    const pf = makePraeformaClient({ baseUrl: config.praeformaBaseUrl, token: config.praeformaToken });
    const an = makeAnatomiaClient({ baseUrl: config.anatomiaBaseUrl });
    try {
      const result = await runReconcile(pf, an, {
        label,
        pfProjectId: pfProject,
        anatomiaProject: anatomiaProject!,
        now: new Date().toISOString(),
      });
      await store.save(result);
      return c.json(result);
    } catch (e) {
      return c.json({ error: 'upstream_failed', detail: String(e) }, 502);
    }
  });

  app.get('/reconcile', async (c) => {
    const project = c.req.query('project');
    if (!project) return c.json({ error: 'project クエリが必要です' }, 400);
    const snap = await store.load(project);
    if (!snap) return c.json({ error: 'no_snapshot', project }, 404);
    return c.json(snap);
  });

  app.get('/', (c) => c.html(VIEWER_HTML));
}
