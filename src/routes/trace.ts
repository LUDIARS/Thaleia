// /api/trace — 関数粒度トレース (実装関数 + spec-links)。 読み取り専用ドリルダウン。
//
// GET /api/trace?project=<anId>&domain=<name>&max=<n>
//   -> TraceResult (trace/types.ts) — ドメイン起点 (既存挙動)。
// GET /api/trace/spec?pfProject=<pfId>&anatomiaProject=<anId>&spec=<code>&max=<n>
//   -> SpecTraceResult (trace/types.ts) — Pf spec 起点 (target ドメインの実装関数を直結)。
//
// ビューアの突合行 / 仕様行から「このドメイン (要件) を実装する関数は?」を掘り下げるのに使う。
// ドメイン起点は Anatomia のみ、 spec 起点は Praeforma(target 解決) + Anatomia を呼ぶ。

import type { Hono } from 'hono';
import type { ThaleiaConfig } from '../config.ts';
import { makeAnatomiaClient } from '../clients/anatomia.ts';
import { makePraeformaClient } from '../clients/praeforma.ts';
import { runTrace, runSpecTrace } from '../trace/engine.ts';

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

  app.get('/api/trace/spec', async (c) => {
    const pfProject = c.req.query('pfProject')?.trim();
    const anatomiaProject = c.req.query('anatomiaProject')?.trim();
    const spec = c.req.query('spec')?.trim();
    if (!pfProject || !anatomiaProject || !spec) {
      return c.json({ error: 'pfProject / anatomiaProject / spec クエリは必須です' }, 400);
    }
    if (!config.praeformaBaseUrl || !config.anatomiaBaseUrl) {
      return c.json(
        { error: 'upstream_unconfigured', hint: 'PRAEFORMA_BASE_URL と ANATOMIA_BASE_URL を設定してください' },
        503,
      );
    }
    const maxRaw = Number(c.req.query('max'));
    const maxFunctions = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : undefined;
    const pf = makePraeformaClient({ baseUrl: config.praeformaBaseUrl, token: config.praeformaToken });
    const an = makeAnatomiaClient({ baseUrl: config.anatomiaBaseUrl });
    try {
      const result = await runSpecTrace(pf, an, { pfProject, anatomiaProject, specCode: spec, maxFunctions });
      if (!result) return c.json({ error: 'spec_not_found', spec }, 404);
      return c.json(result);
    } catch (e) {
      return c.json({ error: 'upstream_failed', detail: String(e) }, 502);
    }
  });
}
