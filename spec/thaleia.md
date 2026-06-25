# Thaleia — 設計

## 目的

MUSA「9 女神」のタレイア = **企画↔実装トレーサビリティ**。
人間が書いた仕様 (Praeforma) と、機械が解析したコード構造 (Anatomia) は時間とともに
乖離する。Thaleia は両者を **突合** し「仕様と実装がどれだけ一致しているか / どこに穴が
あるか」を継続的に可視化する単独サービス。

## 役割分担 (重要)

| サービス | 役割 | 持つもの |
|---|---|---|
| Anatomia (`An`) | コード解析 / LLM データキャッシュ (機械向け) | 検出ドメイン・コードグラフ・spec-links |
| Praeforma (`Pf`) | 人間が理解する仕様概念の正本 | ドメイン定義・仕様書・要件 |
| **Thaleia (`Th`)** | 上記 2 つを突合して統合ビュー | 突合スナップショット |

Thaleia は**自分で解析も仕様編集もしない**。両サービスの API を呼び、中立モデルに
正規化して突合するだけ (エンジンの二重実装を避ける)。

```
Praeforma  ──(ドメイン+仕様書)──┐
                                 ├─►  Thaleia (突合)  ─►  ReconcileResult (data/*.json + ビューア)
Anatomia   ──(検出ドメイン)─────┘
```

## データフロー

1. `POST /reconcile { label, pf_project, anatomia_project }`
2. Praeforma から ドメイン定義 + 仕様書(+target) を取得
3. Anatomia から 検出ドメイン(実装あり) を取得
4. 中立モデルに正規化 → `reconcile()` (純粋関数) で突合
5. 結果を `data/<label>.json` に保存して返す

## 突合結果 (ReconcileResult)

- `domainMatches`: 仕様(人間) ↔ 実装(機械) のドメイン対応 (matched / name-mismatch /
  spec-only=実装欠落 / code-only=仕様欠落)
- `specCoverage`: 各仕様が実装されているか + 根拠
- `gaps`: 実装の無い仕様 / 仕様の無い実装ドメイン (両方向)
- `summary`: 件数集計

詳細は [feature/reconcile.md](./feature/reconcile.md)、API は [interface/api.md](./interface/api.md)。

## 設計判断

- **純粋層の分離**: `reconcile/match.ts` は上流 I/O を持たない純粋関数。fixture で決定的に
  テストできる (`__tests__/match.test.ts`)。上流取得は `reconcile/engine.ts` と `clients/`。
- **無言フォールバック禁止**: 上流未設定/エラーは mock に落とさず明示エラー (503/502)。
- **名寄せ**: `normalizeName` で大小文字/区切り/全半角を畳んで `Player`↔`player-move` を一致。
  v1 は名前一致のみ。意味照合 (embedding) は次フェーズ。

## スコープ (v1 / 次フェーズ)

| | v1 | 次フェーズ |
|---|---|---|
| 突合の軸 | domain ↔ detected domain | + spec-links による関数粒度トレース |
| spec target | domain のみ | + scene(layout) |
| 名寄せ | 正規化名一致 | + 意味照合 (embedding) |
| 保存 | JSON snapshot | 履歴/差分 (前回との乖離変化) |
