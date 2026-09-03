# Thaleia

MUSA「9 人の女神」の **タレイア** — **施策設計ツール (成否リスクのスコア化)**。略称: `Th`。

企画 (施策) を入れると、**UX / 実装コスト / AI 実装可否 / ドメイン解析 / Di 議論** の 5 軸で
成否リスクを採点し、根拠 (evidence) と欠損 (missing) と判定 (verdict) を返す評価専用サービス。

> 正本設計: Castra `spec/plan/2026-09-03-thaleia-initiative-design-tool.md` (2026-09-03 neco 承認済)。
> 旧 Thaleia の役割 (Praeforma × Anatomia の突合) は撤去した。突合の正本は Anatomia にある。
> 関数粒度トレース (`/api/trace`) だけは Anatomia に同等物が無いので残置している。

## 何をするか

```
POST /api/initiatives            企画を登録する
POST /api/initiatives/:id/evaluate   5 軸で採点する
GET  /                           結果を見る (レーダー / 四象限 / 減点理由 / 根拠リンク)
```

Thaleia は **解析も議論もテスト計画も判断基準も持たない**。既に在るサービスを呼ぶだけ:

| 上流 | 引くもの |
|---|---|
| Anatomia (`An`) | 検出ドメイン / モジュール / entrypoint-graph / hotspots / 二層ドメインビュー / spec-links / scenes / screens / 整理提案 |
| Discutere (`Di`) | ペルソナ別の議論集計、施策からの議論起票、既存パターン (mechanics / aesthetics) |
| Augur (`Ag`) | `review-plan` (この変更に要る検査) / `tests list` (回帰テストの登録状況) |
| Genius | 判断カード (過去に同種の施策をどう裁いたか) |
| Ludus (`Lu`) | game-lexicon (凡庸性の参照先。Web サービスではないのでファイルを読む) |

## 評価軸

| 軸 | 重み | 何を見るか |
|---|---|---|
| UX | 0.25 | 導線の一貫性 / 学習コスト / 既存 UX との整合 / 体験の意図の言語化 |
| 実装コスト | 0.15 | 触るドメインの変更面積を対数で写す。**日数・金額は出さない** |
| AI 実装可否 | 0.20 | 仕様の具体性 / spec-link 密度 / テスト充足率 / 過去判断 |
| ドメイン解析 | 0.15 | 二層 (業務/プログラム) 整合と未返済の整理提案 |
| Di 議論 | 0.25 | ペルソナ別の内部スコアと単独合否 (四象限で可視化) |

**上流が取れない軸は 0 点にせず `missing` に理由を積み、総合 confidence を落とす**
(無言フォールバック禁止)。confidence が 0.5 未満ならビューアが「判定保留」と出す。

### 種別ごとの特殊ルール

- **new-content**: 既存パターン (Ludus lexicon + Di mechanics/aesthetics) との重なりが大きいほど
  **凡庸性ペナルティ**で総合点を引く。1 件も当たらなければペナルティ 0
- **improvement**: `fan-in × hotspot 度 × (1 − 回帰テスト充足率) × 二層不整合` でデグレード危険度を出し、
  0.7 以上なら **他の軸がどれだけ良くても `defer` (見送り)**。「先に返済」リストを添える

## ビューア (`GET /`)

ビルド不要の SPA。施策一覧 (verdict と total の推移) → 詳細 (5 軸レーダー / 総合 / verdict /
減点理由) → **Di 四象限散布** (点 = ペルソナ、サイズ = 内部スコア、色 = 単独合否。点をクリックすると
opinion / consensus / traitFit / 閾値の内訳と発話が出る) → improvement のデグレード内訳 →
evidence から Anatomia / Discutere / Genius へのディープリンク。

## 構成

```
src/
├── index.ts            Hono server entry (port 8890)
├── config.ts           env (上流 URL / 重み / 閾値 / claude モデル)
├── clients/            anatomia / discutere / augur / genius / ludus / praeforma
├── initiative/         施策と評価の型 + 永続化 (data/initiatives/)
├── evaluators/         5 軸 (各 純粋関数 + engine) + pipeline / project-facts / targets
├── rules/              banality (new-content) / defer (improvement)
├── aggregate/          total / verdict / confidence (すべて純粋)
├── text/               名寄せ・語彙正規化 (純粋)
├── trace/ links/ unified/  残置機能 (関数粒度トレース / spec-link 棚卸し / 統合ビュー)
├── llm/                claude -p spawn (--model 固定)
├── routes/             /api/initiatives / trace / links / unified / ビューア
└── store/              JSON 永続化 (最新 + history)
```

純粋関数は fixture で決定的にテストする。**LLM を呼ぶのは engine 層だけ**。

## 起動

```sh
npm install
ANATOMIA_BASE_URL=http://localhost:4200 \
DISCUTERE_BASE_URL=http://localhost:3110 \
GENIUS_BASE_URL=http://localhost:4230 \
AUGUR_BIN=C:/path/to/Augur/bin/augur.mjs \
LUDUS_REPO_DIR=C:/path/to/Ludus \
  npm start            # tsx src/index.ts (port 8890)
```

上流は未設定でも起動する (`/health` は返る)。未設定の上流に依存する軸は `missing` になる。

## 開発

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

すべての変更は feat ブランチ → PR → squash merge。main 直 push 禁止。

## 関係

- **Anatomia** (`An`) — コード解析。突合の正本でもある
- **Discutere** (`Di`) — ペルソナ議論。Thaleia 向けの persona 集計 API を持つ
- **Augur** (`Ag`) — テスト計画。常駐しない CLI
- **Genius** — neco の判断カード
- **Ludus** (`Lu`) — ゲーム辞書
- **MUSA** — 9 女神計画。Thaleia はその最初の実装サービス
