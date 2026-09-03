// ディープリンク生成 — 突合行から Praeforma(仕様編集) / Anatomia(コード解析) へ送り出す URL を組む。
//
// Thaleia 自身は編集も解析もしない。 ギャップを見つけたら「編集は Praeforma へ・解析は Anatomia へ」
// 誘導するのが統合ビューの本体 (= ハブ性はナビゲーションとして持つ)。
//
// ここは純粋関数。 web URL が未設定 (null) なら null を返し、 UI 側はリンクではなく素のテキストにする
// (無言で誤ったホストへリンクしない = 無言フォールバック禁止)。
//
// ── 遷移先ルート (2026-06-26 実フロントで確認) ───────────────────────────────
//   Praeforma: web/src/main.tsx の Routes より `/projects/:pid` (ProjectShowPage)。
//     ProjectShowPage の表示切替は overview/domains/objects/layouts/specs の「内部 state」で、
//     **現状 URL クエリを読まない**。 よって `?tab=&focus=` はページ着地までは効くが個別
//     エンティティへのフォーカスは未消費 (将来 useSearchParams 化で focus が効く想定)。
//     tab 名 (domains/specs/layouts) は実値に合わせてある。
//   Anatomia: src/adapters/web/server.ts の `GET /` が管理パネル SPA を返す。 SPA も URL クエリを
//     読まないが、 `?project=` は API 側の実パラメータ名なので合わせてある (+focus は将来用)。
// パスとパラメータ名は実フロントに一致。 フロントが focus を消費するようになれば本ファイル不変で効く。

export interface WebTargets {
  /** Praeforma フロントエンド URL。 未設定なら Praeforma へのリンクを出さない。 */
  praeformaWebUrl: string | null;
  /** Anatomia web URL。 未設定なら Anatomia へのリンクを出さない。 */
  anatomiaWebUrl: string | null;
}

/** ドメイン突合 1 行ぶんのリンク (片側のみ存在することがあるので両方 nullable)。 */
export interface DomainRowLinks {
  /** Praeforma の該当ドメインを開く (pfDomain がある行のみ)。 */
  praeforma: string | null;
  /** Anatomia の該当ドメインを開く (anatomiaDomain がある行のみ)。 */
  anatomia: string | null;
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

/** HTML の href に出せる HTTP(S) URL だけを受け付ける。 */
function safeWebBase(webUrl: string | null): string | null {
  if (!webUrl) return null;
  try {
    const parsed = new URL(webUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return trimSlash(webUrl);
  } catch {
    return null;
  }
}

/** Praeforma のプロジェクトページを tab + focus 付きで開く (ProjectShowPage、`/projects/:pid`)。 */
function praeformaTabUrl(
  webUrl: string | null,
  pfProjectId: string,
  tab: 'domains' | 'specs' | 'layouts',
  focus: string,
): string | null {
  const base = safeWebBase(webUrl);
  if (!base || !pfProjectId) return null;
  const q = `tab=${encodeURIComponent(tab)}&focus=${encodeURIComponent(focus)}`;
  return `${base}/projects/${encodeURIComponent(pfProjectId)}?${q}`;
}

/** Anatomia 管理パネル (`/`) を project + focus 付きで開く。 */
function anatomiaFocusUrl(webUrl: string | null, anatomiaProject: string, focus: string): string | null {
  const base = safeWebBase(webUrl);
  if (!base || !anatomiaProject) return null;
  const q = `project=${encodeURIComponent(anatomiaProject)}&focus=${encodeURIComponent(focus)}`;
  return `${base}/?${q}`;
}

/** Praeforma の該当ドメイン (domains タブ) を開く URL。 */
export function praeformaDomainUrl(webUrl: string | null, pfProjectId: string, domain: string): string | null {
  return praeformaTabUrl(webUrl, pfProjectId, 'domains', domain);
}

/** Praeforma の該当 spec (specs タブ) を開く URL。 */
export function praeformaSpecUrl(webUrl: string | null, pfProjectId: string, specCode: string): string | null {
  return praeformaTabUrl(webUrl, pfProjectId, 'specs', specCode);
}

/** Praeforma のシーン(layout、layouts タブ) を開く URL。 */
export function praeformaSceneUrl(webUrl: string | null, pfProjectId: string, scene: string): string | null {
  return praeformaTabUrl(webUrl, pfProjectId, 'layouts', scene);
}

/** Anatomia 管理パネルで該当ドメインの実装を見る URL。 */
export function anatomiaDomainUrl(webUrl: string | null, anatomiaProject: string, domain: string): string | null {
  return anatomiaFocusUrl(webUrl, anatomiaProject, domain);
}

/** Anatomia 管理パネルで該当スクリーンを見る URL。 */
export function anatomiaScreenUrl(webUrl: string | null, anatomiaProject: string, screen: string): string | null {
  return anatomiaFocusUrl(webUrl, anatomiaProject, screen);
}

/** ドメイン突合行のリンク (存在する側だけ生成)。 */
export function domainRowLinks(
  targets: WebTargets,
  pfProjectId: string,
  anatomiaProject: string,
  row: { pfDomain: string | null; anatomiaDomain: string | null },
): DomainRowLinks {
  return {
    praeforma: row.pfDomain ? praeformaDomainUrl(targets.praeformaWebUrl, pfProjectId, row.pfDomain) : null,
    anatomia: row.anatomiaDomain
      ? anatomiaDomainUrl(targets.anatomiaWebUrl, anatomiaProject, row.anatomiaDomain)
      : null,
  };
}

/** シーン突合行のリンク (存在する側だけ生成)。 */
export function sceneRowLinks(
  targets: WebTargets,
  pfProjectId: string,
  anatomiaProject: string,
  row: { pfScene: string | null; anatomiaScreen: string | null },
): DomainRowLinks {
  return {
    praeforma: row.pfScene ? praeformaSceneUrl(targets.praeformaWebUrl, pfProjectId, row.pfScene) : null,
    anatomia: row.anatomiaScreen
      ? anatomiaScreenUrl(targets.anatomiaWebUrl, anatomiaProject, row.anatomiaScreen)
      : null,
  };
}

// ── 評価 evidence から上流 UI へ (施策設計ツールの追加分) ──────────────────────
//   Discutere: src/api/consensus-routes.ts の `GET /api/admin/consensus` が管制ページ。
//     gap は同ページのドロップダウンで選ぶので `?gap=` を付ける (ページが未消費でも着地はする)。
//   Augur: 常駐しない CLI なので UI は無い。 リンクは張らず evidence の本文だけを出す。
//   Genius: 判断カードの UI は clone ビュー。 `?card=` でカードを指す。

/** Discutere の合意スコア管制ページを gap 付きで開く。 */
export function discutereGapUrl(webUrl: string | null, gapId: string): string | null {
  const base = safeWebBase(webUrl);
  if (!base || !gapId) return null;
  return `${base}/api/admin/consensus?gap=${encodeURIComponent(gapId)}`;
}

/** Discutere の学習ビュー (既存パターンの出どころ) を開く。 */
export function discutereLearningUrl(webUrl: string | null): string | null {
  const base = safeWebBase(webUrl);
  return base ? `${base}/learning` : null;
}

/** Genius の判断カードを開く。 */
export function geniusCardUrl(webUrl: string | null, cardId: string): string | null {
  const base = safeWebBase(webUrl);
  if (!base || !cardId) return null;
  return `${base}/?card=${encodeURIComponent(cardId)}`;
}

/** Anatomia のプロジェクトを開く (ドメイン指定なし)。 */
export function anatomiaProjectUrl(webUrl: string | null, anatomiaProject: string): string | null {
  const base = safeWebBase(webUrl);
  if (!base || !anatomiaProject) return null;
  return `${base}/?project=${encodeURIComponent(anatomiaProject)}`;
}
