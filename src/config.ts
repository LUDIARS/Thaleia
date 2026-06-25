// 起動時 env 解決。 上流 URL/token は必須だが、 未設定でも起動はする (= /health は返す)。
// 突合リクエスト時に未設定なら mock に落とさず明示エラー (無言 fallback 禁止)。

export interface ThaleiaConfig {
  port: number;
  /** Praeforma (人間の仕様) の base URL。 例 http://localhost:8889 */
  praeformaBaseUrl: string | null;
  /** Praeforma API 用 Cernere service token。 */
  praeformaToken: string | null;
  /** Anatomia (コード解析) の web server base URL。 例 http://localhost:4200 */
  anatomiaBaseUrl: string | null;
  /** Praeforma フロントエンドの URL (ディープリンク先)。 未設定ならリンクを出さない。 例 http://localhost:5173 */
  praeformaWebUrl: string | null;
  /** Anatomia web の URL (ディープリンク先)。 未設定なら anatomiaBaseUrl を流用。 */
  anatomiaWebUrl: string | null;
}

export function loadConfig(): ThaleiaConfig {
  return {
    port: Number(process.env.THALEIA_PORT ?? 8890),
    praeformaBaseUrl: process.env.PRAEFORMA_BASE_URL ?? null,
    praeformaToken: process.env.PRAEFORMA_TOKEN ?? null,
    anatomiaBaseUrl: process.env.ANATOMIA_BASE_URL ?? null,
    praeformaWebUrl: process.env.PRAEFORMA_WEB_URL ?? null,
    // Anatomia は web server 自身が UI も兼ねるので、 専用 URL 未設定なら API base を流用。
    anatomiaWebUrl: process.env.ANATOMIA_WEB_URL ?? process.env.ANATOMIA_BASE_URL ?? null,
  };
}
