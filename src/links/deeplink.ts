// ディープリンク生成 — 突合行から Praeforma(仕様編集) / Anatomia(コード解析) へ送り出す URL を組む。
//
// Thaleia 自身は編集も解析もしない。 ギャップを見つけたら「編集は Praeforma へ・解析は Anatomia へ」
// 誘導するのが統合ビューの本体 (= ハブ性はナビゲーションとして持つ)。
//
// ここは純粋関数。 web URL が未設定 (null) なら null を返し、 UI 側はリンクではなく素のテキストにする
// (無言で誤ったホストへリンクしない = 無言フォールバック禁止)。

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

/**
 * Praeforma のプロジェクトページを focus 付きで開く URL。
 * 注: 遷移先ルートは暫定 (`/projects/:id?focus=domain:<name>`)。 Praeforma フロントの確定ルートが
 * 決まったらここだけ直す (UI/呼び出し側は変更不要)。
 */
export function praeformaDomainUrl(webUrl: string | null, pfProjectId: string, domain: string): string | null {
  if (!webUrl || !pfProjectId) return null;
  return `${trimSlash(webUrl)}/projects/${encodeURIComponent(pfProjectId)}?focus=${encodeURIComponent(`domain:${domain}`)}`;
}

/** Praeforma の該当 spec を focus して開く URL。 */
export function praeformaSpecUrl(webUrl: string | null, pfProjectId: string, specCode: string): string | null {
  if (!webUrl || !pfProjectId) return null;
  return `${trimSlash(webUrl)}/projects/${encodeURIComponent(pfProjectId)}?focus=${encodeURIComponent(`spec:${specCode}`)}`;
}

/** Anatomia web で該当ドメインの実装を見る URL。 */
export function anatomiaDomainUrl(webUrl: string | null, anatomiaProject: string, domain: string): string | null {
  if (!webUrl || !anatomiaProject) return null;
  return `${trimSlash(webUrl)}/?project=${encodeURIComponent(anatomiaProject)}&domain=${encodeURIComponent(domain)}`;
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
