// /api/links — コード↔仕様リンクの棚卸し。 読み取り専用。
//
// GET /api/links/worklist?project=<anId>&threshold=<0..1>&max=<n>
//   -> LinkWorklistResult (links/worklist.ts)
//
// 未批准 (ratified:false) / 低 confidence の spec-link を「要レビュー」として集める。
// threshold 未指定なら config.linkConfidenceThreshold (既定 0.7) を使う。 Anatomia のみ呼ぶ。

import type { Hono } from 'hono';
import type { ThaleiaConfig } from '../config.ts';
import { makeAnatomiaClient } from '../clients/anatomia.ts';
import { runLinkWorklist } from '../links/engine.ts';

export function mountLinksRoutes(app: Hono, config: ThaleiaConfig): void {
  app.get('/api/links/worklist', async (c) => {
    const project = c.req.query('project')?.trim();
    if (!project) {
      return c.json({ error: 'project クエリは必須です' }, 400);
    }
    if (!config.anatomiaBaseUrl) {
      return c.json({ error: 'anatomia_unconfigured', hint: 'ANATOMIA_BASE_URL を設定してください' }, 503);
    }
    // threshold は明示クエリ優先、 無指定なら config 既定。 範囲外は config 既定に倒す。
    const tRaw = Number(c.req.query('threshold'));
    const confidenceThreshold =
      Number.isFinite(tRaw) && tRaw >= 0 && tRaw <= 1 ? tRaw : config.linkConfidenceThreshold;
    const maxRaw = Number(c.req.query('max'));
    const maxItems = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : undefined;
    const an = makeAnatomiaClient({ baseUrl: config.anatomiaBaseUrl });
    try {
      const result = await runLinkWorklist(an, { project, confidenceThreshold, maxItems });
      return c.json(result);
    } catch {
      return c.json({ error: 'upstream_failed' }, 502);
    }
  });
}
