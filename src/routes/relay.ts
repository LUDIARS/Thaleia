// /relay/anatomia — Praeforma studio (要件定義モード) からの MUSA リレー受け口。
//
// POST /relay/anatomia  { project, target{kind,name,..}, requirements?, query?, repo? }
//   -> { nodes, edges, summary }  (Praeforma code-graph スキーマが飲める形)
//
// Praeforma → Thaleia → Anatomia の一方向。 Thaleia はここで Praeforma を呼ばない
// (主体が Praeforma 側なので逆流させない)。 上流未設定は mock に落とさず明示エラー。

import type { Hono } from 'hono';
import type { ThaleiaConfig } from '../config.ts';
import { makeAnatomiaClient } from '../clients/anatomia.ts';
import { runRelay } from '../relay/engine.ts';
import type { RelayRequest } from '../relay/types.ts';

export function mountRelayRoutes(app: Hono, config: ThaleiaConfig): void {
  app.post('/relay/anatomia', async (c) => {
    const body = (await c.req.json().catch(() => null)) as RelayRequest | null;
    const project = body?.project?.trim();
    const target = body?.target;
    if (!project || !target?.kind) {
      return c.json({ error: 'project と target.kind は必須です' }, 400);
    }
    // 上流未設定は無言 fallback 禁止 (明示エラー)。 relay は Anatomia のみ必要。
    if (!config.anatomiaBaseUrl) {
      return c.json({ error: 'anatomia_unconfigured', hint: 'ANATOMIA_BASE_URL を設定してください' }, 503);
    }
    const an = makeAnatomiaClient({ baseUrl: config.anatomiaBaseUrl });
    try {
      const result = await runRelay(an, { ...body!, project });
      return c.json(result);
    } catch (e) {
      return c.json({ error: 'upstream_failed', detail: String(e) }, 502);
    }
  });
}
