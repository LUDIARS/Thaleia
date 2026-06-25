// Thaleia server entry — Hono。 突合 (Praeforma × Anatomia) の単独サービス。

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.ts';
import { makeSnapshotStore } from './store/snapshot.ts';
import { mountReconcileRoutes } from './routes/reconcile.ts';
import { mountRelayRoutes } from './routes/relay.ts';
import { mountApiRoutes } from './routes/api.ts';

const config = loadConfig();
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const store = makeSnapshotStore(dataDir);

const app = new Hono();
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', 'authorization'] }));

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'thaleia',
    port: config.port,
    praeforma: Boolean(config.praeformaBaseUrl),
    anatomia: Boolean(config.anatomiaBaseUrl),
  }),
);

mountReconcileRoutes(app, config, store);
mountRelayRoutes(app, config);
mountApiRoutes(app, config, store);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[thaleia] listening on http://localhost:${info.port}`);
  console.log(`[thaleia] praeforma=${config.praeformaBaseUrl ?? '(unset)'} anatomia=${config.anatomiaBaseUrl ?? '(unset)'}`);
});
