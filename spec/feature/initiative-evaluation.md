# feature — 施策評価 (`/api/initiatives`)

企画 (施策) を 5 軸で採点し、根拠 (evidence) と欠損 (missing) と判定 (verdict) を返す。
正本設計は Castra `spec/plan/2026-09-03-thaleia-initiative-design-tool.md`。

## なぜ必要か

企画の採否は「面白そう」「大変そう」で決まりがちで、根拠が残らない。Thaleia は
既に在る解析 (Anatomia)・議論 (Discutere)・テスト計画 (Augur)・過去判断 (Genius)・
ゲーム辞書 (Ludus) を突き合わせ、**同じ物差しで採点して根拠を残す**。

## 施策 (Initiative)

| 項目 | 必須 | 意味 |
|---|---|---|
| `title` | ✓ | 施策名 |
| `kind` | ✓ | `new-content` (新規制作) / `improvement` (改善・改修)。評価ルールが分岐する |
| `project` | ✓ | Anatomia の project id。実装先 |
| `body` | ✓ | 企画本文 (Markdown)。LLM に載るので個人情報は載せない |
| `discutere.gapId` | | Di の議論。未指定なら評価時に Thaleia が起票する |
| `ludus.gameId` | | 凡庸性判定で優先的に参照するゲーム |
| `repoPath` | | 対象リポジトリのローカルパス。Augur CLI (`--repo`) が要る。未指定なら Augur 由来の signal は `missing` |

保存先: `data/initiatives/<id>.json`、評価は `data/initiatives/<id>/evaluations/<ts>.json`。
`<id>` は title の slug + timestamp で、ファイル名にそのまま使える文字だけで構成する。

## 評価の順序

```
1. UX 軸 (Anatomia scenes/screens + LLM) ─┬─ 並行
   Anatomia の事実取得 (project-facts)   ─┘
2. 触るドメインの解決 (LLM 抽出 → normalizeName で名寄せ)
3. AI 実装可否 / ドメイン解析 / Di 議論 / 凡庸性 ─ 並行
   (Di 議論は 1 が出した「意図された体験」を議論の description に使う)
4. 実装コスト (2 の結果と 1 の事実から純粋計算)
5. 集計 (total / verdict / confidence)
```

## 欠損の扱い (無言フォールバック禁止)

上流が未設定・未整備・エラーのとき、その軸は **0 点にしない**。

- `score` は中立点 (50) 付近に置き、`missing` に `{ code, reason }` を積む
- 軸 confidence = `取れた入力数 / その軸が使う入力数` (下限 0.05)
- 総合 confidence = 軸 confidence の積。種別ルールに欠損があれば、同じ障害から派生した
  missing の重複を数えず 0.5 倍する。0.5 未満はビューアで「判定保留」と表示する

これにより「上流が無いから低い点」と「評価した結果が低い点」を取り違えない。

## 判定

| verdict | 条件 |
|---|---|
| `defer` | improvement かつデグレード危険度 >= `THALEIA_DEFER_THRESHOLD` (既定 0.7) |
| `go` | `total >= 70` かつ Di 象限 I が過半 |
| `conditional` | `total >= 50`。条件 = 欠損 + 減点理由 |
| `no-go` | それ以外 |

議論が取れていないとき (象限が無いとき) は `go` に上げない。「支持が過半」と言える根拠が無いため。
評価時に自動起票した Discutere の `gapId` は施策へ保存し、次回評価でも同じ議論を継続する。

## テスト

純粋層は fixture で決定的にテストする (`src/**/__tests__/`)。

| 対象 | テスト |
|---|---|
| `text/normalize.ts` | 表記ゆれの同一視 / 機能語の除去 / overlap 係数 |
| `evaluators/ux/rubric.ts` | 重み付き平均 / 体験制約の減点 / 欠損時の中立点 |
| `evaluators/cost/surface.ts` | 面積の合算 / 新規ドメイン × 1.5 / 対数写像 |
| `evaluators/ai-feasibility/signals.ts` | 足場 signal / 過去判断 signal / 見送り実績の減点 |
| `evaluators/domain/consistency.ts` | 二層不整合の判定と減点 / 返済リスト |
| `evaluators/domain/degrade-risk.ts` | 積の算出 / safety floor の張り付き / 不明を安全と読み替えない |
| `evaluators/discussion/quadrant.ts` | 象限の割り当てと過半判定 |
| `evaluators/discussion/persona-score.ts` | 内部スコア / 閾値の traits 初期化と上書き / 加点減点 |
| `rules/banality.ts` | 凡庸度と該当件数 / 参照無しの missing / 判定方式の明示 |
| `rules/defer.ts` | 閾値超えの見送りと理由 |
| `aggregate/*` | 重み付き合計 / confidence の積 / verdict の分岐 |
| `evaluators/discussion/engine.ts` | LLM 写像の空・部分欠損を象限 I や go 条件に数えない |
| `evaluators/project-facts.ts` | endpoint 別 missing と entrypoint graph の fan-in fallback |
| `clients/anatomia.ts` | `graphNodes` / `graphEdges` の実 payload 契約 |
| `initiative/store.ts` / `store/json-file.ts` | ID 衝突、path traversal、破損 JSON の顕在化 |
