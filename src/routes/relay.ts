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
import { makeClaudeRunner, LlmError } from '../llm/claude.ts';

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
    // LLM 意味ランキングは opt-in (THALEIA_LLM_RANK=1)。 有効時のみ runner を渡す。
    const rank = config.llmRank
      ? { run: makeClaudeRunner(config.claudeBin), topK: config.rankTopK }
      : undefined;
    try {
      const result = await runRelay(an, { ...body!, project }, rank);
      return c.json(result);
    } catch (e) {
      // LLM 失敗は構造結果へ黙って戻さず明示エラー (無言 fallback 禁止)。
      if (e instanceof LlmError) {
        return c.json({ error: e.code, detail: e.message, hint: 'THALEIA_LLM_RANK=1 のとき claude CLI が必要です' }, 502);
      }
      return c.json({ error: 'upstream_failed', detail: String(e) }, 502);
    }
  });
}
