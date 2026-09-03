// Thaleia server entry — Hono。 施策設計ツール (成否リスクのスコア化) の単独サービス。
//
// 役割 (Castra spec/plan/2026-09-03-thaleia-initiative-design-tool.md):
//   企画を入れると、 5 軸のスコアと根拠と可視化が出る **評価専用サービス** (+ 関数粒度トレース)。
//   解析 (Anatomia) / 議論 (Discutere) / テスト計画 (Augur) / 判断基準 (Genius) は持たず、 全部呼ぶだけ。

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.ts';
import { makeInitiativeStore } from './initiative/store.ts';
import { mountInitiativeRoutes } from './routes/initiatives.ts';
import { mountTraceRoutes } from './routes/trace.ts';
import { mountLinksRoutes } from './routes/links.ts';
import { mountUnifiedRoutes } from './routes/unified.ts';
import { mountViewerRoutes } from './routes/viewer.ts';

const config = loadConfig();
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const store = makeInitiativeStore(dataDir);

const app = new Hono();
const allowedOrigins = new Set([
  `http://localhost:${config.port}`,
  `http://127.0.0.1:${config.port}`,
  `http://[::1]:${config.port}`,
]);

// ブラウザからの cross-site 要求は simple request も含めて拒否する。
// Origin を送らない CLI/同一オリジン要求は loopback bind の内側で許可する。
app.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  if (origin && !allowedOrigins.has(origin)) return c.json({ error: 'origin_forbidden' }, 403);
  await next();
});
app.use('*', cors({
  origin: (origin) => allowedOrigins.has(origin) ? origin : '',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['content-type', 'authorization'],
}));

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'thaleia',
    port: config.port,
    anatomia: Boolean(config.anatomiaBaseUrl),
    discutere: Boolean(config.discutereBaseUrl),
    augur: Boolean(config.augurBin),
    genius: Boolean(config.geniusBaseUrl),
    ludus: Boolean(config.ludusRepoDir),
    praeforma: Boolean(config.praeformaBaseUrl),
  }),
);

mountInitiativeRoutes(app, config, store, dataDir);
mountTraceRoutes(app, config);
mountLinksRoutes(app, config);
mountUnifiedRoutes(app, config);
mountViewerRoutes(app);

serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[thaleia] listening on http://localhost:${info.port}`);
  console.log(
    `[thaleia] configured: anatomia=${Boolean(config.anatomiaBaseUrl)} ` +
      `discutere=${Boolean(config.discutereBaseUrl)} augur=${Boolean(config.augurBin)} ` +
      `genius=${Boolean(config.geniusBaseUrl)} ludus=${Boolean(config.ludusRepoDir)}`,
  );
});
