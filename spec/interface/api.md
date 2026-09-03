# interface — API + 上流クライアント契約

## Thaleia REST (port 8890)

Thaleia は `127.0.0.1` のみに bind し、ブラウザの `Origin` は同じポートの loopback origin だけを
受け付ける。別 origin からの simple request / preflight は `403 origin_forbidden`。

### `GET /health`
`{ ok, service:"thaleia", port, anatomia, discutere, augur, genius, ludus, praeforma }`。
上流が設定済かを bool で示す (疎通は見ない)。

## 施策評価 (`routes/initiatives.ts`)

### `POST /api/initiatives`
```jsonc
// request
{ "title": "...",
  "kind": "new-content" | "improvement",
  "project": "<Anatomia project id>",
  "body": "<企画本文 Markdown>",
  "discutere": { "gapId": "<design_gaps.id>" },   // 任意
  "ludus": { "gameId": "..." },                   // 任意
  "repoPath": "C:/path/to/repo" }                // 任意 (Augur CLI の --repo)
// response 201 = Initiative (id / createdAt / updatedAt 付き)
```
- `title` / `kind` / `project` / `body` は必須。欠けたら `400 { error:"invalid_input", hint }`
  (project は「未指定ならドメイン解析軸を skip」ではなく **入力時点で弾く**)
- 本文が JSON でなければ `400 { error:"invalid_json" }`

### `GET /api/initiatives`
`{ items: InitiativeSummary[] }`。`latest` (最新評価の total / verdict / confidence) と
`history` (total の推移、古い順・最大 20 点) を含む。`updatedAt` 降順。

### `GET /api/initiatives/:id`
```jsonc
{ "initiative": { ... },
  "evaluation": { /* Evaluation。 未評価なら null */ },
  "diff": { "previousAt": "...|null", "totalDelta": 0, "verdictChanged": false,
            "axisDeltas": [{ "axis":"ux", "delta": 0 }] },
  "history": [{ "evaluatedAt","total","verdict","confidence" }] }
```
- 施策が無ければ `404 { error:"initiative_not_found" }`
- 初回評価では `diff.totalDelta = null` (前回が無いことを null で示す)

### `POST /api/initiatives/:id/evaluate`
5 軸 + 種別ルール + 集計を 1 回走らせ、`data/initiatives/<id>/evaluations/<ts>.json` に保存する。
```jsonc
// response 200
{ "evaluation": { "axes":[{ "axis","score","confidence","evidence","missing" }],
                  "discussion": { "personas":[...], "quadrantCounts":{...} } | null,
                  "banality": {...} | null, "degrade": {...} | null,
                  "total": 0, "verdict":"go|conditional|defer|no-go", "confidence": 0,
                  "reasons":["..."], "conditions":["..."], "weights": {...} },
  "diff": { ... } }
```
- **個々の上流失敗は 5xx にしない**。その軸の `missing` に積み、総合 confidence を下げる
- 500 が返るのは Thaleia 側の不具合のときだけ (`{ error:"evaluation_failed", detail }`)
- LLM (claude CLI) と上流を直列に呼ぶので応答は分単位になりうる

### `GET /api/config`
`{ anatomia, discutere, augur, genius, ludus, praeforma, weights, deferThreshold }`。
ビューアが「未設定の上流」を注意書きに出すために使う。

### `GET /`
評価ビューア (SPA、ビルド不要)。施策一覧 (verdict と total の推移) → 詳細
(5 軸レーダー / 総合 / verdict / 減点理由) → Di 四象限散布 (点 = ペルソナ、サイズ = 内部スコア、
色 = 単独合否、クリックで opinion / consensus / traitFit / 閾値の内訳と発話) →
improvement のデグレード内訳と「先に返済」→ evidence からの上流ディープリンク。

## 残置機能

### `GET /api/trace?project=<id>&domain=<name>&max=<n>`
対象ドメインの**関数粒度トレース** (実装関数 + 各関数の spec-links)。詳細は
[feature/trace.md](../feature/trace.md)。
```jsonc
{ "domain": "...", "matched": true,
  "functions": [{ "id","name","path","specLinks":[{ "clauseHeading","clauseFile","confidence","ratified" }] }],
  "summary": { "functionCount","linkedFunctions","truncated","totalImplementors" } }
```
- `project` / `domain` 必須 (無ければ 400)、Anatomia 未設定 503、上流エラー 502
- 対象ドメインが Anatomia に無ければ `matched:false` + `functions:[]` (mock を返さない)

### `GET /api/trace/spec?pfProject=<pfId>&anatomiaProject=<anId>&spec=<code>&max=<n>`
**Pf spec 起点**の関数粒度トレース。詳細は [feature/trace.md](../feature/trace.md)。

### `GET /api/links/worklist?project=<anId>&threshold=<0..1>&max=<n>`
未批准 / 低 confidence の spec-link 棚卸し。詳細は [feature/links.md](../feature/links.md)。

### `GET /unified`, `GET /api/unified?anatomiaProject=<id>&pfProject=<id>`
仕様↔ドメインの統合ビュー。詳細は [feature/unified-view.md](../feature/unified-view.md)。

## 上流クライアント契約

### Anatomia (`clients/anatomia.ts`、loopback 無認証)
| 経路 | 使う軸 |
|---|---|
| `GET /api/projects/:id/domains` → `[{ domain, implementorCount, conforms, violationCount }]` | 名寄せ / コスト |
| `GET /api/projects/:id/domain-view` → `{ views:[{ domain, implementors:string[] }] }` | コスト / トレース |
| `GET /api/graph?project=<id>` → `{ nodes:[{ id,name,kind,sourceRange.filePath }], edges:[...] }` | コスト / AI 実装可否 |
| `GET /api/projects/:id/modules` → `{ modules:[...] }` | コスト |
| `GET /api/projects/:id/hotspots` → 上位関数 (配列 or `{ hotspots:[] }`) | デグレード |
| `GET /api/projects/:id/entrypoint-graph` → `EntryPointViewPayload` | fan-in |
| `GET /api/projects/:id/business-domain-view` → `{ domains:[...] }` | 二層整合 |
| `GET /api/projects/:id/program-domain-view` → `{ layers, proposals, modularity }` | 二層整合 / 返済 |
| `GET /api/projects/:id/spec-links` → `SpecLinkRow[]` | AI 実装可否 / トレース |
| `GET /api/projects/:id/scenes` → `{ merged:[{ id,name }] }` / `screens` → `{ screens:[{ name }] }` | UX |

- **`refactoring-tasks` は POST (発行) のみで一覧 API が無い**。未返済の整理提案は
  `program-domain-view` の `proposals` から読む (2026-09-03 実装で確認)
- 404 / 409 (`not-prepared`) は `AnatomiaUnavailableError` にして軸の `missing` へ回す

### Discutere (`clients/discutere.ts`、admin REST は `X-User-Id`/`X-User-Role`、loopback は admin 扱い)
- `GET /api/admin/consensus/:gapId/personas` → `{ gapId, personas: [{ personaId, displayName,
  traits, utterances, opinionScore, consensusScore, agreeRatio }] }` (Di `SPEC-THALEIA-PERSONA-CONSENSUS`)
- `POST /api/admin/gaps` `{ title, description, gameId? }` → `201 { gapId, sessionId }`
  (Di `SPEC-THALEIA-GAP-CREATION`)
- `GET /learning/data?layer=games&limit=&detailLimit=` → `{ games:[{ id,title,mechanics,aesthetics }] }`
  (mechanics / aesthetics テーブルの読み取り経路はこれだけ)

### Augur (`clients/augur.ts`、CLI を spawn。常駐しない)
- `node <AUGUR_BIN> tests list --repo <path> [--domain <d>] --json` → `TestRecord[]`
- `node <AUGUR_BIN> review-plan --json` (stdin に `CreatePlanRequest`) → `{ stages, testCases }`
- exit 1 = リクエスト不正 / exit 2 = Augur 内部エラー。どちらも `AugurUnavailableError` で missing へ

### Genius (`clients/genius.ts`)
- `POST /api/clone/query` `{ text, domain:"work", k }` → `{ cards: ScoredCard[], tookMs }`

### Ludus (`clients/ludus.ts`、ファイル読み)
- `<LUDUS_REPO_DIR>/spec/data/game-lexicon/**/*.toml` を再帰列挙し、トップレベルの
  `id / name_ja / name_en / summary / tags / genres` だけ読む (TOML パーサ依存を増やさない)
- 読めなかったファイルは黙って捨てず `skipped` に積み、凡庸性の `missing` になる

### Praeforma (`clients/praeforma.ts`、bearer = Cernere service token) — 残置機能用
- `GET /api/projects/:pid/domains` / `layouts` / `specs` / `specs/:sid`

## 注意

- 上流が未設定・未整備でも **mock に落とさない**。評価軸は `missing` を積んで confidence を下げ、
  残置機能 (trace / links / unified) は 503 / 502 を返す (無言フォールバック禁止)。
- LLM は `claude -p --model <THALEIA_CLAUDE_MODEL>` を spawn する。モデルを固定しないと
  上限切れの巻き添えで無言終了するため、既定任せにしない。
