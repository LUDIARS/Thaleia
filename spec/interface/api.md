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
最小 HTML ビューア (突合を実行して表で見る)。

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
