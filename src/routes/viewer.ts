// GET / — 評価ビューア (SPA) を返す。 HTML 本体は evaluation-viewer.ts。
//
// 旧突合ビューアはここに在ったが、 突合の正本は Anatomia へ移したので撤去した
// (Castra spec/plan/2026-09-03-thaleia-initiative-design-tool.md §1)。

import type { Hono } from 'hono';
import { EVALUATION_VIEWER_HTML } from './evaluation-viewer.ts';

export function mountViewerRoutes(app: Hono): void {
  app.get('/', (c) => c.html(EVALUATION_VIEWER_HTML));
}
