# Thaleia — Claude Code ルール

## 性格

MUSA「9 女神」の **タレイア** = 企画↔実装トレーサビリティ。
**Praeforma(人間の仕様) と Anatomia(コード解析) の両方と会話してデータを統合する単独サービス**。

役割分担を崩さない:
- **Anatomia** = 解析情報 / LLM データキャッシュ (機械向け)。仕様的概念は持たない。
- **Praeforma** = 人間が理解する仕様/ドメイン/要件の正本。
- **Thaleia** = 上記 2 つを **突合** して統合ビューを作る。自分で解析や仕様編集はしない
  (両サービスを呼ぶだけ。エンジンを二重実装しない)。

## ブランチ + PR 運用

すべての変更は feat ブランチ → PR → squash merge。main 直 push 禁止。AI 実装は 1 PR に集約。

## コード規約

共通規約は `coding-conventions` スキル (= AIFormat/RULE_CODE.md) を正本とする。固有の追加:

- **無言フォールバック禁止**: 上流 URL/token 未設定や上流エラーは mock に落とさず明示エラー。
- **SRP**: `clients/`(上流取得) / `reconcile/`(突合ロジック) / `routes/`(HTTP) / `store/`(永続化)
  を分離。`reconcile/match.ts` は**純粋関数**に保つ (上流 I/O を持ち込まない → fixture テスト可)。
- ESM (`"type":"module"`)、import は `.ts` 拡張子付き (tsx + NodeNext)。

## ビルドとテスト

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm start           # tsx src/index.ts (dev は npm run dev)
```

PR 前に typecheck green + test 全通。

## spec/

AIFormat の分類フォルダに揃える (`data` / `feature` / `interface` / `setup` / `test`)。
- `spec/thaleia.md` — 全体設計
- `spec/feature/reconcile.md` — 突合アルゴリズム
- `spec/interface/api.md` — REST + 上流クライアント契約

## env

| 変数 | 既定 | 役割 |
|---|---|---|
| `THALEIA_PORT` | 8890 | HTTP ポート (PORT-MAP へ登録予定) |
| `PRAEFORMA_BASE_URL` | (なし) | Praeforma API。未設定なら /reconcile は 503 |
| `PRAEFORMA_TOKEN` | (なし) | Praeforma 用 Cernere service token |
| `ANATOMIA_BASE_URL` | (なし) | `anatomia web` の URL。未設定なら /reconcile は 503 |
| `PRAEFORMA_WEB_URL` | (なし) | ビューアの Praeforma ディープリンク先。未設定ならリンク無効表示 |
| `ANATOMIA_WEB_URL` | `ANATOMIA_BASE_URL` | ビューアの Anatomia ディープリンク先 (未設定なら API base 流用) |
| `THALEIA_LLM_RANK` | (なし) | `1` で `/relay/anatomia` の LLM 意味ランキングを有効化 (既定 off=構造選択のみ) |
| `THALEIA_CLAUDE_BIN` | `claude` | ランキング用 claude CLI (Windows は git-bash wrapper を差せる) |
| `THALEIA_RANK_TOP_K` | `40` | ランキング後に残す上限件数 |

## 次フェーズ (v1 未了)

- Anatomia spec-links / graph を使った行レベルのトレーサビリティ。
- 意味照合 (名寄せだけでなく embedding で近い概念を対応付け)。
- 実環境フル E2E は通済 (studio anatomia-link / scene reconcile を実 Pf+An で確認)。

完了済: scene(layout) target 突合 (domain と同じ二部マッチで layout↔screen) /
MUSA リレー `/relay/anatomia` + LLM 意味ランキング / PROJECT-CODES `Th` 追記。
