// /api/trace — ドメインの関数粒度トレース (実装関数 + spec-links)。 読み取り専用ドリルダウン。
//
// GET /api/trace?project=<id>&domain=<name>&max=<n>
//   -> TraceResult (trace/types.ts)
//
// ビューアの突合行から「このドメインを実装する関数は?」を掘り下げるのに使う。 Anatomia のみ呼ぶ。

import type { Hono } from 'hono';
import type { ThaleiaConfig } from '../config.ts';
import { makeAnatomiaClient } from '../clients/anatomia.ts';
import { runTrace } from '../trace/engine.ts';

export function mountTraceRoutes(app: Hono, config: ThaleiaConfig): void {
  app.get('/api/trace', async (c) => {
    const project = c.req.query('project')?.trim();
    const domain = c.req.query('domain')?.trim();
    if (!project || !domain) {
      return c.json({ error: 'project と domain クエリは必須です' }, 400);
    }
    if (!config.anatomiaBaseUrl) {
      return c.json({ error: 'anatomia_unconfigured', hint: 'ANATOMIA_BASE_URL を設定してください' }, 503);
    }
    const maxRaw = Number(c.req.query('max'));
    const maxFunctions = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : undefined;
    const an = makeAnatomiaClient({ baseUrl: config.anatomiaBaseUrl });
    try {
      const result = await runTrace(an, { project, domain, maxFunctions });
      return c.json(result);
    } catch (e) {
      return c.json({ error: 'upstream_failed', detail: String(e) }, 502);
    }
  });
}
