# feature — 突合 (reconcile) アルゴリズム

`src/reconcile/match.ts` の純粋関数 `reconcile()`。上流に依存せず fixture でテスト可能。
ドメインとシーン(layout) を同じ二部マッチ (`bipartiteMatch`) で突き合わせる。

## 入力 (中立モデル)

- `pfDomains: { id, name, description? }[]` — Praeforma のドメイン定義
- `pfLayouts: { id, name, description? }[]` — Praeforma のシーン (= layout)。省略時は scene 突合スキップ
- `pfSpecs: { id, code, title, status?, priority?, targetDomains: string[], targetScenes?: string[] }[]`
  — 仕様書。`targetDomains`/`targetScenes` は spec_targets(kind=domain/layout) を
  **ドメイン名/シーン名**に解決済
- `anatomiaDomains: { name, implementorCount }[]` — 実装関数を持つ検出ドメイン
- `anatomiaScreens: { name }[]` — 検出された UI スクリーン/シーン (存在 = 実装あり)。省略時は scene 突合スキップ

## 名寄せ

`normalizeName(s)` = NFKC + 小文字化 + `[\s_\-./]` 除去。
→ `"Player Move"` / `"player-move"` / `"Player.Move"` はすべて `playermove` に畳まれ一致。

## ドメイン / シーン突合 (共通の二部マッチ)

各 Pf 名を正規化名で Anatomia 側に照合 (domain↔domain, layout(scene)↔screen):

| 条件 | status | 意味 |
|---|---|---|
| 正規化一致 かつ 原文一致 | `matched` | 完全一致 |
| 正規化一致 だが 原文違い | `name-mismatch` | 表記ゆれ |
| Pf にあり Anatomia に無し | `spec-only` | **実装欠落** |
| Anatomia にあり Pf に無し (impl>0) | `code-only` | **仕様欠落** |

→ `domainMatches[]` (pfDomain/anatomiaDomain) と `sceneMatches[]` (pfScene/anatomiaScreen)。

## 仕様カバレッジ

仕様の `targetDomains` / `targetScenes` のいずれかが「実装あり」なら `implemented=true`
(ドメインは implementorCount>0、 スクリーンは存在=実装あり)。`evidence` に根拠を残す:

- 実装あり → `実装: domain:<names>, scene:<names>`
- target 未指定 → `target 未指定 (突合不能)`
- それ以外 → `target <names> に対応する実装が見つからない`

## ギャップ (両方向)

- `gaps.specsWithoutImpl`: `implemented=false` の仕様 code 一覧
- `gaps.codeDomainsWithoutSpec`: `code-only` の Anatomia ドメイン名一覧
- `gaps.codeScreensWithoutSpec`: `code-only` の Anatomia スクリーン名一覧

## summary

`{ pfDomains, anatomiaDomains, matchedDomains, pfScenes, anatomiaScreens, matchedScenes,
specs, implementedSpecs }`。`anatomiaDomains`/`anatomiaScreens` は正規化重複を畳んだ後の数
(同名は implementorCount 最大を採用)。

## 不変条件 (テスト)

- `Player` ↔ `player` / `TitleScreen` ↔ `titlescreen` は name-mismatch で一致する
- 実装の無い Pf ドメイン/シーンは spec-only、その target を持つ仕様は未実装に入る
- 仕様の無い実装ドメイン/スクリーンは code-only かつ codeDomainsWithoutSpec/codeScreensWithoutSpec に入る
- layout(scene) target を持つ仕様は、 対応スクリーンが存在すれば実装済になる
