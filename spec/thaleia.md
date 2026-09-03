# Thaleia — 設計

## 目的

MUSA「9 女神」のタレイア = **施策設計ツール (成否リスクのスコア化)**。

企画 (施策) を入れると、**UX / 実装コスト / AI 実装可否 / ドメイン解析 / Di 議論** の 5 軸で
成否リスクを客観的に採点し、根拠と可視化を返す **評価専用サービス**。

正本設計: Castra `spec/plan/2026-09-03-thaleia-initiative-design-tool.md` (2026-09-03 neco 承認済)。

> 旧 Thaleia の役割 (Praeforma × Anatomia の突合) は **撤去**した。突合の正本は Anatomia の
> `domain-organization/proposals/reconciliation` と `spec-links` にある。関数粒度トレース
> (`/api/trace`) だけは Anatomia に同等物が無いので残置している (設計 §8-5)。

## 役割分担 (重要)

| サービス | 役割 | Thaleia が引くもの |
|---|---|---|
| Anatomia (`An`) | コード解析 | 検出ドメイン / モジュール / entrypoint-graph / hotspots / 二層ドメインビュー / spec-links / scenes / screens / 整理提案 |
| Discutere (`Di`) | ペルソナ議論 | `GET /api/admin/consensus/:gapId/personas` / `POST /api/admin/gaps` / `GET /learning/data` |
| Augur (`Ag`) | テスト計画 | CLI `augur review-plan` / `augur tests list` |
| Genius | neco の判断カード | `POST /api/clone/query` |
| Ludus (`Lu`) | ゲーム辞書 | `spec/data/game-lexicon/**.toml` (Web サービスではないのでファイルを読む) |
| **Thaleia (`Th`)** | 施策の評価 | 上記を呼んで採点・保存・可視化するだけ |

Thaleia は **解析も議論もテスト計画も判断基準も持たない**。全部呼ぶだけ (エンジンの二重実装を避ける)。

```
Anatomia ─┐
Discutere ─┤
Augur     ─┼─►  Thaleia (5 軸評価 + 種別ルール + 集計)  ─►  Evaluation (data/initiatives/ + ビューア)
Genius    ─┤
Ludus     ─┘
```

## データフロー

1. `POST /api/initiatives` で施策を登録 (`data/initiatives/<id>.json`)
2. `POST /api/initiatives/:id/evaluate` で評価を 1 回走らせる
   1. UX 軸 (Anatomia の scenes/screens + LLM ルーブリック) と Anatomia の事実取得を並行に回す
   2. UX 軸が抽出した「意図された体験」を Di の議論起票に渡す
   3. 触るドメインを LLM で挙げ、Anatomia の検出ドメインへ名寄せする (実装コスト軸とドメイン軸で共有)
   4. 5 軸 + 種別ルール (凡庸性 / デグレード) を回し、集計する
3. 結果を `data/initiatives/<id>/evaluations/<ts>.json` に積み、前回比 diff を返す

## 評価軸 (各軸 0..100 + confidence 0..1 + evidence + missing)

| 軸 | 重み | 何を見るか |
|---|---|---|
| UX | 0.25 | 導線の一貫性 / 学習コスト / 既存 UX との整合 / 体験の意図の言語化。Augur の体験制約と矛盾すれば減点 |
| 実装コスト | 0.15 | 触るドメインの変更面積 (ファイル数 × 2 + 関数数 + fan-in) を対数で写す。**日数・金額は出さない** |
| AI 実装可否 | 0.20 | 仕様の具体性 (LLM) / spec-link 密度 / Augur テスト充足率 / Genius の過去判断 |
| ドメイン解析 | 0.15 | 触るドメインの二層 (業務/プログラム) 整合と未返済の整理提案 |
| Di 議論 | 0.25 | ペルソナ別の内部スコアと単独合否 (下記) |

**上流が取れない軸は 0 点にせず `missing` に理由を積み、総合 confidence を落とす** (無言フォールバック禁止)。

## Di 議論軸 — 四象限 + ペルソナ内部スコア

- 各ペルソナの発話を LLM で 2 軸へ写像する: X = 実現性 / Y = 体験価値 (各 −1..+1)
- 象限: I 推進 (価値も実現性も高) / II 条件付き推進 / III 再考 / IV 却下
- 内部スコア `internal = 0.4 * norm(opinionScore) + 0.4 * norm(consensusScore) + 0.2 * traitFit`
  (opinion / consensus は **その議論の中の最大値**で正規化する。議論をまたいだ絶対比較はしない)
- 閾値はペルソナごと。traits から初期化し (慎重寄りは +5、新規性重視は −5)、
  `data/personas/<personaId>.json` の `{ "threshold": 0..100 }` で上書きできる
- 各ペルソナは **自分の内部スコアで単独に合否を出す**。合議で丸めない
- 軸スコア = pass 内部スコア合計 / 全内部スコア合計 × 100。象限 I が過半なら +5、
  内部スコア上位 1/3 に象限 IV のペルソナがいれば 1 人あたり −8
- 内部スコアが全員 0 (誰の支持も測れていない) のときは加点も減点もしない

## 種別ごとの特殊ルール

- **new-content — 凡庸性ペナルティ**: 企画本文を Ludus の game-lexicon と Di の mechanics/aesthetics に
  当て、`凡庸度 = 最大類似度 × (該当件数 / 5)`、`total -= 凡庸度 × 20`。
  embedding を持たない環境では**正規化語彙の重なり (overlap 係数)** で代替し、その方式を必ず結果に書く
- **improvement — デグレード判定**: `危険度 = fan-in × hotspot 度 × (1 − 回帰テスト充足率) × 二層不整合`。
  Augur が safety floor 相当の検査を要求しているのに回帰テストが 0 件なら危険度を上限に張る。
  危険度 >= 0.7 なら **他の軸がどれだけ良くても `verdict = defer` (見送り)**

## 総合

```
total      = Σ_axis (weight_axis * score_axis) − banality_penalty (new-content のみ)
verdict    = defer (improvement かつ危険度 >= 閾値)
           | go (total >= 70 かつ Di 象限 I が過半)
           | conditional (total >= 50)
           | no-go
confidence = Π_axis confidence_axis × 種別ルール confidence
  (種別ルールに欠損があれば 0.5 倍。0.5 未満はビューアで「判定保留」と表示)
```

重み・閾値・凡庸性係数は env で上書きできる (`THALEIA_WEIGHT_*` / `THALEIA_DEFER_THRESHOLD` /
`THALEIA_BANALITY_K`)。重みは 1 本でも上書きすると全体を正規化して合計 1 に保つ。

## 残置している機能

| 機能 | 経路 | 理由 |
|---|---|---|
| 関数粒度トレース | `GET /api/trace`, `GET /api/trace/spec` | 関数→spec 節の結び表示は Anatomia 側に無い (設計 §8-5) |
| spec-link ワークリスト | `GET /api/links/worklist` | 未批准 / 低 confidence リンクの棚卸し。評価の evidence 足場にもなる |
| 統合ビュー | `GET /unified`, `GET /api/unified` | 撤去指示の対象外。Anatomia の domain-view と重なるので将来の整理候補 |

## コード構成

```
src/
├── index.ts                 Hono (port 8890)
├── config.ts                上流 URL / 重み / 閾値
├── clients/                 anatomia / discutere / augur / genius / ludus / praeforma
├── initiative/              types / store (data/initiatives)
├── evaluators/
│   ├── axis.ts              AxisResult 組み立て (score と confidence の分離)
│   ├── context.ts           依存の束
│   ├── project-facts.ts     Anatomia の事実を 1 回だけ取得して共有
│   ├── targets.ts           触るドメインの解決 (LLM 抽出 + 決定的名寄せ)
│   ├── pipeline.ts          5 軸 + ルール + 集計のオーケストレーション
│   ├── ux/                  rubric (純粋) + engine
│   ├── cost/                surface (純粋) + engine
│   ├── ai-feasibility/      signals (純粋) + engine
│   ├── domain/              consistency (純粋) + degrade-risk (純粋) + engine
│   └── discussion/          quadrant (純粋) + persona-score (純粋) + engine
├── rules/                   banality (純粋) + banality-engine / defer (純粋)
├── aggregate/               total / verdict / confidence (すべて純粋)
├── text/                    名寄せ・語彙正規化 (純粋)
├── trace/ links/ unified/   残置機能
├── llm/                     claude -p spawn (--model 固定)
├── routes/                  /api/initiatives / trace / links / unified / ビューア
└── store/                   JSON 永続化 (最新 + history)
```

純粋関数 (quadrant / persona-score / degrade-risk / consistency / surface / rubric / signals /
banality / aggregate) は fixture で決定的にテストする。**LLM を呼ぶのは engine 層だけ**。
