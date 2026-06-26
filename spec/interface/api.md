# interface — API + 上流クライアント契約

## Thaleia REST (port 8890)

### `GET /health`
`{ ok, service:"thaleia", port, praeforma:bool, anatomia:bool }`。上流設定済かを bool で示す。

### `POST /reconcile`
```jsonc
// request
{ "label": "kuzu-survivors", "pf_project": "<Praeforma project id>",
  "anatomia_project": "<Anatomia project id>" }   // anatomia_project 省略時は pf_project を流用
// response 200 = ReconcileResult + diff (feature/reconcile.md), data/<label>.json に保存
```
- `label` / `pf_project` 必須 (無ければ 400)
- 上流未設定: `503 { error:"praeforma_unconfigured"|"anatomia_unconfigured", hint }`
- 上流エラー: `502 { error:"upstream_failed", detail }`
- 応答の `diff` = 保存前の最新と比較した前回比 (初回は `hasPrevious:false`)。保存時に
  直前の最新は `data/history/<slug>/<generatedAt>.json` へ退避される

### `GET /reconcile?project=<label>`
保存済スナップショットを返す。無ければ `404 { error:"no_snapshot" }`。

### `POST /relay/anatomia`
Praeforma の要件定義モード (studio) が呼ぶ **MUSA リレー受け口**。Praeforma → Thaleia →
Anatomia の一方向 (ここで Praeforma は呼ばない)。詳細は [feature/relay.md](../feature/relay.md)。
```jsonc
// request (Praeforma musa-relay.ts MusaAnatomiaRequest と同形)
{ "project": "<Anatomia project id>",
  "target": { "kind": "domain|layout", "id": "...", "name": "...", "description": "..." },
  "requirements": [{ "code","title","description","priority","category","acceptance":["..."] }],
  "query": "<検索文>", "repo": "<任意>" }
// response 200
{ "nodes": [{ "key","label","type":"symbol|file","anatomia_ref":{ "path","symbol","kind" } }],
  "edges": [{ "from","to","relation":"calls|depends|implements|related" }],
  "summary": "<何を根拠に何件返したか>" }
```
- `project` / `target.kind` 必須 (無ければ 400)
- Anatomia 未設定: `503 { error:"anatomia_unconfigured", hint }` (Praeforma は不要)
- 上流エラー (project 不在など): `502 { error:"upstream_failed", detail }`
- 対象ドメインが Anatomia の検出ドメインに無い場合は **空 nodes/edges + 理由 summary**
  (mock に落とさない)

### `GET /api/trace?project=<id>&domain=<name>&max=<n>`
対象ドメインの**関数粒度トレース** (実装関数 + 各関数の spec-links)。詳細は
[feature/trace.md](../feature/trace.md)。
```jsonc
// response 200 = TraceResult
{ "domain": "...", "matched": true,
  "functions": [{ "id","name","path","specLinks":[{ "clauseHeading","clauseFile","confidence","ratified" }] }],
  "summary": { "functionCount","linkedFunctions","truncated","totalImplementors" } }
```
- `project` / `domain` 必須 (無ければ 400)、Anatomia 未設定 503、上流エラー 502
- 対象ドメインが Anatomia に無ければ `matched:false` + `functions:[]` (mock を返さない)
- 関数は `MAX_TRACE_FUNCTIONS`(200) で切り詰め (超過は `truncated:true` + `totalImplementors`)

### `GET /api/trace/spec?pfProject=<pfId>&anatomiaProject=<anId>&spec=<code>&max=<n>`
**Pf spec 起点**の関数粒度トレース。Pf で spec→target ドメインを解決し、各 target ドメインの
TraceResult を束ねる (要件↔関数の直結トレーサビリティ)。詳細は [feature/trace.md](../feature/trace.md)。
```jsonc
// response 200 = SpecTraceResult
{ "specCode":"...", "specTitle":"...", "targetDomains":["..."],
  "domains": [ /* TraceResult (上記 /api/trace と同形) */ ],
  "summary": { "domainCount","matchedDomains","functionCount","linkedFunctions" } }
```
- `pfProject` / `anatomiaProject` / `spec` 必須 (無ければ 400)
- Pf か Anatomia 未設定 `503 { error:"upstream_unconfigured" }`、上流エラー 502
- spec code が Pf に無ければ `404 { error:"spec_not_found" }`
- target ドメインの重複は正規化名で 1 つに畳む。未検出 target は `matched:false` のドメイン要素

### `GET /api/links/worklist?project=<anId>&threshold=<0..1>&max=<n>`
未批准 (`ratified:false`) / 低 confidence の spec-link を「要レビュー」で集める棚卸し。
詳細は [feature/links.md](../feature/links.md)。
```jsonc
// response 200 = LinkWorklistResult
{ "threshold":0.7,
  "items": [{ "from","fromName","resolvedName","resolvedPath","clauseHeading","clauseFile",
              "confidence","ratified","reasons":["unratified"|"low-confidence"] }],
  "summary": { "totalLinks","flagged","unratified","lowConfidence","shown","truncated" } }
```
- `project` 必須 (無ければ 400)、Anatomia 未設定 503、上流エラー 502
- `threshold` 省略/範囲外は `THALEIA_LINK_CONFIDENCE_THRESHOLD` (既定 0.7) を使う
- 並びは未批准を先・confidence 昇順 (レビュー優先度順)、`MAX_WORKLIST_ITEMS`(300) で切り詰め

### `GET /`
突合専用ビューア (SPA、ビルド不要)。スナップショット一覧 → 突合マトリクス/仕様カバレッジ/
ギャップ・ワークリストを表示し、各行から Praeforma(仕様編集)/Anatomia(実装閲覧)へ
ディープリンクで送り出す。実装ありドメイン行の「関数 ▾」で `/api/trace`、仕様カバレッジ行の
「関数 ▾」で `/api/trace/spec` を引いて関数粒度を展開する。詳細下部の「未批准 spec-link
ワークリスト」セクションは `/api/links/worklist` を引いて要レビューのコード↔仕様リンクを並べる。
下記 `/api/*` を読む。

## 閲覧用 API (`routes/api.ts`、読み取り専用)

### `GET /api/config`
`{ praeformaWeb:bool, anatomiaWeb:bool, reconcileReady:bool }`。リンク先 web URL の設定有無と
突合実行可否。ビューアが未設定の注意書きを出すために使う。

### `GET /api/snapshots`
`{ items: SnapshotSummary[] }`。保存済み突合のサマリ (project / generatedAt / summary /
gapCount)、generatedAt 降順。トップのカード用。

### `GET /api/snapshots/:label`
1 件の ReconcileResult に**行ごとのディープリンクを付与**して返す (無ければ 404)。
- `domainMatches[].links` / `sceneMatches[].links = { praeforma:string|null, anatomia:string|null }`
  (その側が存在し、かつ web URL 設定済のときのみ URL。無ければ null)
- `specCoverage[].praeformaUrl = string|null` (該当 spec を開くリンク)
- `diff` = history の直前 run と比較した前回比 (無ければ `hasPrevious:false`)

リンク URL は `links/deeplink.ts` の純粋関数で生成。web URL 未設定なら null を返し、
ビューアは無効表示にする (無言で誤ったホストへリンクしない)。

遷移先ルートは実フロントで確認済 (2026-06-26):
- Praeforma `/projects/:pid?tab=domains|specs|layouts&focus=<x>` (ProjectShowPage、`web/src/main.tsx`)
- Anatomia `/?project=<id>&focus=<x>` (管理パネル SPA、`src/adapters/web/server.ts` の `GET /`)

パスと `tab`/`project` パラメータ名は実値に一致。ただし**両フロントは現状 URL クエリを
読まない**ため、リンクは該当ページに着地するが個別エンティティへのフォーカスは未消費
(将来フロントが `useSearchParams` で focus を読めば `deeplink.ts` 不変で効く)。

## 上流クライアント契約

### Praeforma (`clients/praeforma.ts`、bearer = Cernere service token)
- `GET /api/projects/:pid/domains` → `{ items: [{ id, name, description }] }`
- `GET /api/projects/:pid/layouts` → `{ items: [{ id, name, description }] }` (= シーン)
- `GET /api/projects/:pid/specs` → `{ items: [{ id, code, title, status, priority }] }`
- `GET /api/projects/:pid/specs/:sid` → `{ targets: [{ kind, refId }] }`
  (`kind==="domain"`→domains, `kind==="layout"`→layouts を id→name で解決し
  targetDomains/targetScenes にする)

### Anatomia (`clients/anatomia.ts`、loopback 無認証)
- `GET /api/domains?project=<id>` → `{ domains: string[] }`
  (実装関数を持つ検出ドメイン名のみ。存在 = implementorCount 1 とみなす)
- `GET /api/projects/:id/screens` → `{ screens:[{ name, ... }] }` (検出 UI スクリーン=シーン。存在=実装あり)
- `GET /api/projects/:id/spec-links` → `SpecLinkRow[]` (`{ from, fromName, clauseHeading, clauseFile, confidence, ratified }`)
  (コード↔リポ spec 節リンク。`from` は関数 anchor id もしくはファイルパス。trace が関数へ join)
- `GET /api/graph?project=<id>` → `{ nodes:[{ id,name,kind,sourceRange.filePath }], edges:[{ from,to,kind }] }`
  (関数粒度のコードグラフ全量。relay が部分グラフへ絞り込む)
- `GET /api/projects/:id/domain-view` → `{ views:[{ domain, implementors:string[] }] }`
  (検出ドメイン → 実装 AnchorId 群。relay の domain アンカーに使う)

## 注意

- Praeforma の返却は Drizzle raw row (camelCase)。`id/name/code/title/refId/kind` のみ使う。
- 上流が片方でも未設定なら突合は実行せず明示エラー (無言フォールバック禁止)。
