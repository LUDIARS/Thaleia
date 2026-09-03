import type { Hono } from 'hono';
import type { ThaleiaConfig } from '../config.ts';
import { makeAnatomiaClient } from '../clients/anatomia.ts';
import { makePraeformaClient } from '../clients/praeforma.ts';
import { runUnifiedView } from '../unified/engine.ts';
import { UNIFIED_VIEWER_HTML } from './unified-viewer.ts';

export function mountUnifiedRoutes(app: Hono, config: ThaleiaConfig): void {
  app.get('/unified', (c) => c.html(UNIFIED_VIEWER_HTML));

  app.get('/api/unified', async (c) => {
    const anatomiaProject = c.req.query('anatomiaProject')?.trim() ?? c.req.query('project')?.trim();
    const pfProject = c.req.query('pfProject')?.trim() || null;
    const label = c.req.query('label')?.trim() || pfProject || anatomiaProject;
    if (!anatomiaProject) {
      return c.json({ error: 'anatomiaProject query is required' }, 400);
    }
    if (!config.anatomiaBaseUrl) {
      return c.json({ error: 'anatomia_unconfigured', hint: 'Set ANATOMIA_BASE_URL' }, 503);
    }

    const an = makeAnatomiaClient({ baseUrl: config.anatomiaBaseUrl });
    const pf =
      pfProject && config.praeformaBaseUrl
        ? makePraeformaClient({ baseUrl: config.praeformaBaseUrl, token: config.praeformaToken })
        : null;

    try {
      const result = await runUnifiedView(an, { project: label ?? anatomiaProject, anatomiaProject, pfProject }, pf);
      return c.json(result);
    } catch {
      return c.json({ error: 'upstream_failed' }, 502);
    }
  });
}
