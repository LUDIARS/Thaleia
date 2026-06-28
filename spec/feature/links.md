# feature — 未批准 spec-link ワークリスト (`/api/links/worklist`)

Anatomia の spec-links (コード↔リポ spec 節リンク) は `confidence`(0..1) と `ratified`(批准済?)
を持つ。自動抽出されたリンクのうち**まだ人手で確認されていない / 確度の低い**ものを棚卸しし、
「要レビューのコード↔仕様リンク」を一覧にする。

## なぜ突合に必要か

trace は「リンクがある」前提で関数↔spec 節を結ぶが、そのリンク自体の質はまちまち。未批准・
低 confidence のリンクを放置すると突合結果 (実装あり/なし) の信頼性が下がる。ワークリストで
レビュー対象を機械的に絞り、批准を回せるようにする。

## 処理 (`links/worklist.ts` 純粋 + `links/engine.ts` I/O)

`runLinkWorklist()` (engine): Anatomia の `spec-links` と `graph` を並列取得。

`buildLinkWorklist()` (純粋):
1. 各リンクを判定: `ratified===false` → 理由 `unratified`、`confidence < threshold` → 理由
   `low-confidence`。いずれも該当しなければ除外 (両方該当は理由 2 つ)。
2. graph で `from`(anchor id もしくはファイルパス) を関数名/パスに解決 (無ければ `null`)。
3. 並びは**未批准を先・confidence 昇順** (= レビュー優先度の高い順)、見出しで tie-break。
4. `MAX_WORKLIST_ITEMS`(300) で切り詰め (`summary.truncated` + `flagged` で全数明示)。

## 閾値 (env opt-in)

低 confidence の閾値は `THALEIA_LINK_CONFIDENCE_THRESHOLD` (**既定 0.7**、0..1 外/不正値は既定)。
`/api/links/worklist?threshold=<0..1>` で 1 リクエストだけ上書きもできる。閾値**未満**を低
confidence とみなす。

## 無言フォールバック禁止

- Anatomia 未設定 → `503`、上流エラー → `502`。
- 要レビューが 0 件なら空 `items` + サマリ (ダミーを捏造しない)。
- 切り詰めは `summary.truncated` + `flagged`(全数) で明示。
