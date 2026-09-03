---
task: "initiative-design-tool"
project: "Thaleia"
kind: "実装"
created: "2026-09-03"
source_session: "lictor-bd116544-3e8f-4edb-a6a8-de24ed733b3c"
---
# Thaleia を施策設計ツール (成否リスクのスコア化) へ再定義

## 目的

Thaleia の役割が Anatomia と重複していた突合から離れ、**企画 (施策) を入れると成否リスクを
5 軸で採点して根拠と可視化を返す評価専用サービス**になる。判断の物差しと根拠がサービスに
残るので、企画の採否を「面白そう / 大変そう」ではなく同じ基準で比較できる。

正本設計: Castra `spec/plan/2026-09-03-thaleia-initiative-design-tool.md` (2026-09-03 neco 承認済。
§8 は 1〜4・6 が A 案、5 は「trace だけ残す」)。Memoria #1918 / #1919 / #1920 を 1 PR に集約。

## 実装の要点

- **撤去**: `src/reconcile`, `src/relay`, 旧突合ビューア (`GET /` と `/api/snapshots` 系)、
  `spec/feature/reconcile.md`, `spec/feature/relay.md`。共有していた型と名寄せは
  `clients/anatomia-types.ts` / `clients/praeforma-types.ts` / `text/normalize.ts` へ移設した。
- **転用**: `src/trace` (関数粒度トレースは Anatomia に同等物が無いので残置)、`src/store`
  (突合専用だった「最新 + history」機構を汎用 JSON 永続化へ)、`src/llm` (`--model` を固定)、
  `src/links` (Discutere / Genius / Anatomia へのディープリンクを追加)。
- **追加**: `initiative` (型 + 永続化 + REST 4 本)、clients 5 本、evaluators 5 軸
  (各 純粋関数 + engine)、rules 2 本 (凡庸性 / 見送り)、aggregate 3 本、評価ビューア。
- 上流が取れない軸は **0 点にせず `missing` を積んで confidence を落とす** (無言フォールバック禁止)。
- Anatomia ドメインを登録: `evaluation` / `discussion-matrix` / `risk-rules`
  (membership が `src/reconcile` だけだった `spec-tuning` は削除)。

### 再利用探索の採否

`anatomia where` は landings 空 (新規面) を返したので、既存実装からの再利用は
`context` と直接読解で決めた。

| 既存実装 | 採否 | 理由 |
|---|---|---|
| `store/snapshot.ts` の「最新 + history 退避」 | **採用** (一般化して `store/json-file.ts`) | 評価の推移と前回比 diff がまさに同じ形。突合専用の型依存だけ外した |
| `reconcile/match.ts` の `normalizeName` | **採用** (`text/normalize.ts` へ移設) | LLM が挙げたドメイン候補を Anatomia の検出ドメインへ名寄せするのに必要。凡庸性のトークン化も同じ場所に置いた |
| `llm/claude.ts` の `claude -p` spawn と `extractJson` | **採用** | 5 軸すべてが JSON 応答を要求する。`--model` の固定だけ足した |
| `links/deeplink.ts` | **採用** (拡張) | evidence から上流 UI へ送る導線が新ビューアでも要る。web URL 未設定なら null を返す既存の方針をそのまま使った |
| `reconcile/diff.ts` | **不採用** | 突合結果専用の差分。評価は軸スコアの差分なので `routes/initiatives.ts` の `diffEvaluations` を新規に書いた |
| `relay/select.ts` / `rank.ts` | **不採用** | Praeforma へのグラフ整形。再定義後の Thaleia に受け手が無い |

## 完了条件

- 旧突合 (`src/reconcile`, `src/relay`, 旧ビューア、`/api/snapshots` 系) が撤去され、
  `src/trace` / `src/store` / `src/llm` / `src/links` が残って転用されている。
  README / `spec/thaleia.md` / `CLAUDE.md` / `spec/interface/api.md` が新定義になっている。
- 施策 API が動く: `POST /api/initiatives` / `GET /api/initiatives` / `GET /api/initiatives/:id` /
  `POST /api/initiatives/:id/evaluate`。施策は `data/initiatives/<id>.json`、評価は
  `data/initiatives/<id>/evaluations/<ts>.json` に積み、前回比 diff を返す。
- 上流クライアントが 5 本ある: Anatomia (domains / modules / entrypoint-graph / hotspots /
  domain-view / business-domain-view / program-domain-view / spec-links / scenes / screens /
  整理提案)、Discutere (persona 集計 + gap 起票 + 既存パターン)、Augur (CLI spawn)、
  Genius (`/api/clone/query`)、Ludus (リポの game-lexicon を直接読む)。
- 評価軸が 5 本そろい、各軸が「純粋関数 (fixture テスト) + engine (I/O)」に分かれている。
  上流が無い環境でも 0 点にせず `missing` を積んで confidence を落とす。
- Di 議論軸が四象限 (X=実現性 / Y=体験価値) への写像、ペルソナ内部スコア
  (`w_op*norm(opinion) + w_cs*norm(consensus) + w_tr*traitFit`)、ペルソナ別閾値
  (traits から初期化 / `data/personas/<id>.json` で上書き)、単独合否、
  軸スコア (pass 内部スコア合計 / 全内部スコア合計 × 100)、象限 I 過半の加点と
  象限 IV の上位ペルソナによる減点を持つ。
- 種別ルールが 2 本ある: new-content の凡庸性ペナルティ (embedding が無ければ正規化語彙の
  重なりで代替し、方式を結果に書く)、improvement のデグレード見送り (危険度 >= 0.7 で
  `verdict = defer`)。
- 集計が重み UX .25 / コスト .15 / AI .20 / ドメイン .15 / Di .25 で total を出し、
  verdict (go / conditional / defer / no-go) と confidence (Π、0.5 未満は判定保留) を返す。
  重み・閾値は env で上書きできる。
- ビューア `GET /` (ビルド不要 SPA) が施策一覧 (verdict / total 推移)、詳細 (5 軸レーダー +
  総合 + verdict + 減点理由)、Di 四象限散布 (点 = ペルソナ / サイズ = 内部スコア /
  色 = pass・fail / クリックで内訳と発話)、improvement のデグレード内訳と「先に返済」、
  evidence からのディープリンクを出す。
- 着地ドメインを Anatomia に登録している (`evaluation` / `discussion-matrix` / `risk-rules`)。
- `npm run typecheck` と `npm test` が緑。

## 自己検証

| 項目 | 結果 |
|---|---|
| `grep -rn "reconcile" src --include=*.ts` | **0 件** |
| `grep -rn "relay" src --include=*.ts` | **0 件** |
| `src/trace` の残置 | `build.ts` / `engine.ts` / `types.ts` / `__tests__` すべて残っている |
| 5 evaluators の純粋関数テスト | `ux/__tests__/rubric.test.ts` / `cost/__tests__/surface.test.ts` / `ai-feasibility/__tests__/signals.test.ts` / `domain/__tests__/consistency.test.ts` + `degrade-risk.test.ts` / `discussion/__tests__/quadrant.test.ts` + `persona-score.test.ts` |
| 2 rules の純粋関数テスト | `rules/__tests__/banality.test.ts` / `rules/__tests__/defer.test.ts` |
| aggregate の純粋関数テスト | `aggregate/__tests__/aggregate.test.ts` (total / confidence / verdict / conditions) |
| `npm run typecheck` | 緑 |
| `npm test` | 16 ファイル / **117 件 緑** |

### Anatomia verify (`git diff --cached | anatomia verify --project wt-thaleia-initiative`)

- `rule_conformance` **pass** / `duplication` **pass** / `coupling_delta` **pass**
- `spec_linkage` fail (**warn レベル**、`blocking: null`): 新規関数に `@implements SPEC-xxx` が無い。
  Thaleia は元から `@implements` を 1 件も持たない (`grep -rn "@implements" src` = 0 件) ので、
  この PR だけで注記規約を導入せず既存方針に揃えた。Revisor 側でも `spec_linkage` は advisory。
- `convention_drift` fail (**warn レベル**): `routes/initiatives.ts` の内部ヘルパ
  (`diffEvaluations` / `makeDeps` / `parseInitiativeInput`) に「兄弟が持つ `Routes` 接尾辞が無い」。
  これらはルート登録関数ではなく同ファイル内の純粋ヘルパなので、接尾辞は付けない。
- block レベルのゲート失敗は無し。

## 残っている前提未確定

- 統合ビュー (`GET /unified`, `src/unified`) は撤去指示の対象外だったので残置した。
  Anatomia の domain-view と重なるため、設計 §1 の方針では将来の整理候補になる。
- 凡庸性の類似度は embedding ではなく正規化語彙の重なり (overlap 係数)。
  embedder が使える環境ができたら差し替える (方式は評価結果の `method` に必ず出る)。
- 重み・閾値は設計 §5 の初期値のまま。設計 §9-5 の「実施策 1 件で通して調整」は未実施。
