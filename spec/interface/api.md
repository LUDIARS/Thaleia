# interface — API + 上流クライアント契約

## Thaleia REST (port 8890)

### `GET /health`
`{ ok, service:"thaleia", port, praeforma:bool, anatomia:bool }`。上流設定済かを bool で示す。

### `POST /reconcile`
```jsonc
// request
{ "label": "PrivateGame", "pf_project": "<Praeforma project id>",
  "anatomia_project": "<Anatomia project id>" }   // anatomia_project 省略時は pf_project を流用
// response 200 = ReconcileResult (feature/reconcile.md), data/<label>.json に保存
```
- `label` / `pf_project` 必須 (無ければ 400)
- 上流未設定: `503 { error:"praeforma_unconfigured"|"anatomia_unconfigured", hint }`
- 上流エラー: `502 { error:"upstream_failed", detail }`

### `GET /reconcile?project=<label>`
保存済スナップショットを返す。無ければ `404 { error:"no_snapshot" }`。

### `GET /`
突合専用ビューア (SPA、ビルド不要)。スナップショット一覧 → 突合マトリクス/仕様カバレッジ/
ギャップ・ワークリストを表示し、各行から Praeforma(仕様編集)/Anatomia(実装閲覧)へ
ディープリンクで送り出す。下記 `/api/*` を読む。

## 閲覧用 API (`routes/api.ts`、読み取り専用)

### `GET /api/config`
`{ praeformaWeb:bool, anatomiaWeb:bool, reconcileReady:bool }`。リンク先 web URL の設定有無と
突合実行可否。ビューアが未設定の注意書きを出すために使う。

### `GET /api/snapshots`
`{ items: SnapshotSummary[] }`。保存済み突合のサマリ (project / generatedAt / summary /
gapCount)、generatedAt 降順。トップのカード用。

### `GET /api/snapshots/:label`
1 件の ReconcileResult に**行ごとのディープリンクを付与**して返す (無ければ 404)。
- `domainMatches[].links = { praeforma:string|null, anatomia:string|null }`
  (その側のドメインが存在し、かつ web URL 設定済のときのみ URL。無ければ null)
- `specCoverage[].praeformaUrl = string|null` (該当 spec を開くリンク)

リンク URL は `links/deeplink.ts` の純粋関数で生成。web URL 未設定なら null を返し、
ビューアは無効表示にする (無言で誤ったホストへリンクしない)。
遷移先ルート (`/projects/:id?focus=domain:<name>` 等) は暫定で、各フロントの確定後に
`deeplink.ts` だけ直せばよい。

## 上流クライアント契約

### Praeforma (`clients/praeforma.ts`、bearer = Cernere service token)
- `GET /api/projects/:pid/domains` → `{ items: [{ id, name, description }] }`
- `GET /api/projects/:pid/specs` → `{ items: [{ id, code, title, status, priority }] }`
- `GET /api/projects/:pid/specs/:sid` → `{ targets: [{ kind, refId }] }`
  (`kind==="domain"` の `refId` を domains の id→name で解決して targetDomains にする)

### Anatomia (`clients/anatomia.ts`、loopback 無認証)
- `GET /api/domains?project=<id>` → `{ domains: string[] }`
  (実装関数を持つ検出ドメイン名のみ。存在 = implementorCount 1 とみなす)

## 注意

- Praeforma の返却は Drizzle raw row (camelCase)。`id/name/code/title/refId/kind` のみ使う。
- 上流が片方でも未設定なら突合は実行せず明示エラー (無言フォールバック禁止)。
