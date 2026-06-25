// /api/* — 突合ビューア (SPA) 用の JSON エンドポイント。
//
// GET /api/snapshots            -> 保存済み突合のサマリ一覧 (トップのカード)
// GET /api/snapshots/:label     -> 1 件の突合 + 行ごとのディープリンク (マトリクス/ギャップ表示)
// GET /api/config               -> ディープリンク先 (Praeforma/Anatomia web) の設定有無
//
// 突合そのものの実行/取得は routes/reconcile.ts (POST /reconcile, GET /reconcile)。 ここは
// 「閲覧用に整形する」読み取り専用層に徹する (SRP: 実行とビューを分ける)。

import type { Hono } from 'hono';
import type { ThaleiaConfig } from '../config.ts';
import type { SnapshotStore } from '../store/snapshot.ts';
import { domainRowLinks, sceneRowLinks, praeformaSpecUrl } from '../links/deeplink.ts';

export function mountApiRoutes(app: Hono, config: ThaleiaConfig, store: SnapshotStore): void {
  const targets = {
    praeformaWebUrl: config.praeformaWebUrl,
    anatomiaWebUrl: config.anatomiaWebUrl,
  };

  app.get('/api/config', (c) =>
    c.json({
      praeformaWeb: Boolean(config.praeformaWebUrl),
      anatomiaWeb: Boolean(config.anatomiaWebUrl),
      reconcileReady: Boolean(config.praeformaBaseUrl && config.anatomiaBaseUrl),
    }),
  );

  app.get('/api/snapshots', async (c) => c.json({ items: await store.list() }));

  app.get('/api/snapshots/:label', async (c) => {
    const snap = await store.load(c.req.param('label'));
    if (!snap) return c.json({ error: 'no_snapshot', project: c.req.param('label') }, 404);

    // 各ドメイン行に「Praeforma で編集 / Anatomia で実装を見る」リンクを付与。
    const domainMatches = snap.domainMatches.map((m) => ({
      ...m,
      links: domainRowLinks(targets, snap.pfProjectId, snap.anatomiaProject, m),
    }));

    // 各シーン行にも同様のリンクを付与 (旧スナップショットは sceneMatches 無し → [])。
    const sceneMatches = (snap.sceneMatches ?? []).map((m) => ({
      ...m,
      links: sceneRowLinks(targets, snap.pfProjectId, snap.anatomiaProject, m),
    }));

    // 仕様行に「Praeforma で該当 spec を開く」リンクを付与。
    const specCoverage = snap.specCoverage.map((s) => ({
      ...s,
      praeformaUrl: praeformaSpecUrl(config.praeformaWebUrl, snap.pfProjectId, s.specCode),
    }));

    return c.json({ ...snap, domainMatches, sceneMatches, specCoverage });
  });
}
