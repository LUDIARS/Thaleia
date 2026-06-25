# feature — 関数粒度トレース (`/api/trace`)

「ドメイン X は実装あり」を**関数粒度**へ掘り下げる。対象ドメインの実装関数を列挙し、
各関数に Anatomia の spec-links (コード↔リポ spec 節リンク) を結びつける。Thaleia は解析を
二重実装せず、Anatomia の 3 つのビューを合成するだけ。

## なぜ突合に必要か

reconcile は domain/scene 粒度で「実装あり/なし」を出すが、企画↔実装トレーサビリティの
最終的な価値は「どの**関数**が要件を実装しているか」。spec-links を使って関数とリポ spec 節を
結ぶことで、Pf 仕様 → target ドメイン → 実装関数 → (各関数の) repo spec 節 まで辿れる。

## 処理 (`trace/build.ts` 純粋 + `trace/engine.ts` I/O)

Anatomia の 3 ビューを並列取得 (`engine`):
- `GET /api/projects/:id/domain-view` → ドメイン → 実装 anchor id 群
- `GET /api/graph` → anchor id → 関数名/パス
- `GET /api/projects/:id/spec-links` → `from`(anchor id もしくはファイルパス) → spec 節

`buildTrace()` (純粋):
1. 対象ドメイン名を正規化名で照合 → 実装 anchor id 群 (無ければ `matched:false`)。
2. graph で id→{name,path} を解決 (graph に無い古い id はスキップ)。
3. spec-links を `from` でグループ化し、各関数に **from===関数id または from===関数ファイルパス**
   の両対応で join (重複は clauseHeading|clauseFile で排除、confidence 降順)。
4. リンクあり関数を先頭に、名前順で安定ソート、`MAX_TRACE_FUNCTIONS`(200) で切り詰め。

> 実測 (adventurecube): spec-links は全て**ファイル単位** (`from`=パス) だったため、join は
> ファイルパス経由で効く。将来 Anatomia が関数単位リンクを出せば id 直当ても拾う。

## 無言フォールバック禁止

- Anatomia 未設定 → `503`、上流エラー → `502`。
- 対象ドメインが検出ドメインに無い → `matched:false` + 空 (ダミー関数を捏造しない)。
- 上限切り詰めは `summary.truncated` + `totalImplementors` で明示 (黙って削らない)。

## 次フェーズ

- Pf spec → target ドメインの実装関数を直接ぶら下げる (現状はドメイン単位のドリルダウン)。
- spec-link confidence/ratified を使った「未批准リンク」ワークリスト。
