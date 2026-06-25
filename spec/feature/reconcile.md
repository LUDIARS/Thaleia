# feature — 突合 (reconcile) アルゴリズム

`src/reconcile/match.ts` の純粋関数 `reconcile()`。上流に依存せず fixture でテスト可能。

## 入力 (中立モデル)

- `pfDomains: { id, name, description? }[]` — Praeforma のドメイン定義
- `pfSpecs: { id, code, title, status?, priority?, targetDomains: string[] }[]`
  — 仕様書。`targetDomains` は spec_targets(kind=domain) を **ドメイン名**に解決済
- `anatomiaDomains: { name, implementorCount }[]` — 実装関数を持つ検出ドメイン

## 名寄せ

`normalizeName(s)` = NFKC + 小文字化 + `[\s_\-./]` 除去。
→ `"Player Move"` / `"player-move"` / `"Player.Move"` はすべて `playermove` に畳まれ一致。

## ドメイン突合

各 Pf ドメインを正規化名で Anatomia ドメインに照合:

| 条件 | status | 意味 |
|---|---|---|
| 正規化一致 かつ 原文一致 | `matched` | 完全一致 |
| 正規化一致 だが 原文違い | `name-mismatch` | 表記ゆれ |
| Pf にあり Anatomia に無し | `spec-only` | **実装欠落** |
| Anatomia にあり Pf に無し (impl>0) | `code-only` | **仕様欠落** |

## 仕様カバレッジ

仕様の `targetDomains` のいずれかが「実装あり (= 一致した Anatomia ドメインが implementorCount>0)」
なら `implemented=true`。`evidence` に根拠を残す:

- 実装あり → `実装ドメイン: <names>`
- target 未指定 → `target ドメイン未指定 (突合不能)`
- それ以外 → `target ドメイン <names> に対応する実装が見つからない`

## ギャップ (両方向)

- `gaps.specsWithoutImpl`: `implemented=false` の仕様 code 一覧
- `gaps.codeDomainsWithoutSpec`: `code-only` の Anatomia ドメイン名一覧

## summary

`{ pfDomains, anatomiaDomains, matchedDomains, specs, implementedSpecs }`。
`anatomiaDomains` は正規化重複を畳んだ後の数 (同名は implementorCount 最大を採用)。

## 不変条件 (テスト)

- `Player` ↔ `player` は name-mismatch で一致する
- 実装の無い Pf ドメインは spec-only、その target を持つ仕様は未実装に入る
- 仕様の無い実装ドメインは code-only かつ codeDomainsWithoutSpec に入る
