# Thaleia — Claude Code ルール

## 性格

MUSA「9 女神」の **タレイア** = **施策設計ツール (成否リスクのスコア化)**。
企画を入れると 5 軸のスコアと根拠と可視化が出る **評価専用サービス** (+ 関数粒度トレース)。

正本設計: Castra `spec/plan/2026-09-03-thaleia-initiative-design-tool.md` (2026-09-03 neco 承認済)。

役割分担を崩さない (**Thaleia は解析も議論もテスト計画も判断基準も持たない**):

- **Anatomia** (`An`) = コード解析。突合・ドメイン組織の正本もここ
- **Discutere** (`Di`) = ペルソナ議論。persona 集計 / gap 起票 API を持つ
- **Augur** (`Ag`) = テスト計画。常駐しない CLI (`review-plan` / `tests list`)
- **Genius** = neco の判断カード (`/api/clone/query`)
- **Ludus** (`Lu`) = ゲーム辞書。Web サービスではないのでリポのファイルを読む
- **Thaleia** (`Th`) = 上記を呼んで **採点・保存・可視化** するだけ

## ブランチ + PR 運用

すべての変更は feat ブランチ → PR → squash merge。main 直 push 禁止。AI 実装は 1 PR に集約。

## コード規約

共通規約は `coding-conventions` スキル (= AIFormat/RULE_CODE.md) を正本とする。固有の追加:

- **無言フォールバック禁止**: 上流未設定・未整備・エラーを mock に落とさない。
  評価軸は **0 点にせず `missing` に理由を積んで confidence を下げる**。
  残置機能 (trace / links / unified) は 503 / 502 を返す。
- **日数・金額を出さない** (decision-metrics)。実装コストは変更面積で表す。
- **SRP**: `clients/`(上流取得) / `evaluators/*/<pure>.ts`(算出) / `evaluators/*/engine.ts`(I/O) /
  `rules/`・`aggregate/`(純粋) / `routes/`(HTTP) / `store/`(永続化) を分離。
  **LLM を呼ぶのは engine 層だけ**。純粋層は fixture でそのままテストできる状態に保つ。
- ESM (`"type":"module"`)、import は `.ts` 拡張子付き (tsx + NodeNext)。
- LLM は `claude -p --model <固定>` を spawn する。モデルを既定任せにしない
  (上限切れの巻き添えで無言終了するため)。

## ビルドとテスト

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm start           # tsx src/index.ts (dev は npm run dev)
```

PR 前に typecheck green + test 全通。

## spec/

AIFormat の分類フォルダに揃える (`data` / `feature` / `interface` / `setup` / `test`)。
- `spec/thaleia.md` — 全体設計 (5 軸 / 四象限 / 種別ルール / 総合)
- `spec/feature/initiative-evaluation.md` — 施策評価の入力・順序・欠損の扱い・テスト
- `spec/feature/trace.md` / `links.md` / `unified-view.md` — 残置機能
- `spec/interface/api.md` — REST + 上流クライアント契約
- `spec/domains/*.domain.json` — コードドメイン定義の**正本** (Anatomia が読む。
  ローカル `.anatomia/` はキャッシュなので git 管理しない)

## env

| 変数 | 既定 | 役割 |
|---|---|---|
| `THALEIA_PORT` | 8890 | HTTP ポート |
| `ANATOMIA_BASE_URL` | (なし) | `anatomia web` の URL。未設定なら Anatomia 由来の軸が missing |
| `DISCUTERE_BASE_URL` | (なし) | Discutere。未設定なら Di 議論軸と凡庸性の Di 側が missing |
| `DISCUTERE_ADMIN_USER_ID` | (なし) | admin REST 用 `X-User-Id`。loopback なら不要 |
| `GENIUS_BASE_URL` | (なし) | Genius 判断カード |
| `AUGUR_BIN` | (なし) | `node <bin> review-plan` で呼ぶ Augur の entry point |
| `LUDUS_REPO_DIR` | (なし) | Ludus リポのルート (`spec/data/game-lexicon/**` を読む) |
| `PRAEFORMA_BASE_URL` / `PRAEFORMA_TOKEN` | (なし) | 残置機能 (spec 起点トレース / 統合ビュー) 用 |
| `*_WEB_URL` | API base 流用 | evidence のディープリンク先。未設定ならリンクを出さない |
| `THALEIA_CLAUDE_BIN` | `claude` | LLM 用 claude CLI (Windows は git-bash wrapper を差せる) |
| `THALEIA_CLAUDE_MODEL` | `claude-sonnet-5` | `--model` に固定で渡すモデル |
| `THALEIA_CLAUDE_TIMEOUT_MS` | `120000` | LLM 1 回の timeout |
| `THALEIA_WEIGHT_UX` 他 | 設計 §5 の既定 | 軸の重み。1 本でも上書きすると全体を正規化する |
| `THALEIA_DEFER_THRESHOLD` | `0.7` | 見送り閾値 |
| `THALEIA_BANALITY_K` | `20` | 凡庸度 1.0 のとき total から引く点 |
| `THALEIA_LINK_CONFIDENCE_THRESHOLD` | `0.7` | spec-link ワークリストの低 confidence 閾値 |

## 完了済 (主要機能)

- 施策の登録・一覧・取得・評価 (`/api/initiatives`)、評価履歴と前回比 diff。
- 5 軸評価 (UX / 実装コスト / AI 実装可否 / ドメイン解析 / Di 議論) + 集計 + verdict。
- Di 四象限マトリクスとペルソナ内部スコア (単独合否 / 閾値の traits 初期化とファイル上書き)。
- 種別ルール: 凡庸性ペナルティ (new-content) / デグレード見送り (improvement)。
- 評価ビューア (レーダー / 四象限散布 / デグレード内訳 / evidence ディープリンク)。
- 残置: 関数粒度トレース `/api/trace` `/api/trace/spec`、spec-link ワークリスト、統合ビュー。

## 次フェーズ

- 実施策 1 件を通して重み・閾値を調整する (設計 §9-5)。
- 埋め込みが使える環境では凡庸性の類似度を embedding に差し替える (現状は語彙の重なり)。
- 統合ビュー (`/unified`) は Anatomia の domain-view と重なるので整理候補。
