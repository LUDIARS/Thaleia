# feature — MUSA リレー (`/relay/anatomia`)

Praeforma の要件定義モード (studio) が「対象 (ドメイン/シーン) に関連する処理グラフ」を
Anatomia から引くための受け口。**Praeforma → Thaleia → Anatomia の一方向**で、Thaleia は
解析エンジンを二重実装せず、Anatomia が返したグラフを Praeforma の code-graph スキーマが
飲める形へ正規化するだけ。

## なぜ Thaleia が持つか

役割分担 (Praeforma=人間の仕様の主体 / Anatomia=解析キャッシュ / Thaleia=突合) 上、
Praeforma は Anatomia CLI を直叩きしない。連携は必ず Thaleia (MUSA) 経由。Praeforma 側
契約は `server/src/lib/musa-relay.ts` の `MusaAnatomiaRequest`/`MusaAnatomiaResponse`。

## 処理 (`relay/engine.ts` + `relay/select.ts`)

1. `GET /api/graph?project=` で Anatomia のコードグラフ全量を取得 (`clients/anatomia.ts`)。
2. `target.kind==='domain'` のときだけ `GET /api/projects/:id/domain-view` で
   **検出ドメイン → 実装 AnchorId 群**を取得 (layout は検索語照合のみ)。
3. `selectRelayGraph()` (純粋関数) で部分グラフを切り出す:
   - **アンカー** = 対象ドメイン名 (大小無視で完全一致) の実装ノード集合。
   - **検索語照合** = `query` を 2 文字以上のトークンに割り、node の `name`/`path` に
     含まれるノードを和集合。
   - 選択ノードを `name` 安定順で確定し、上限 `MAX_RELAY_NODES`(300) で切る。
   - エッジは**両端が選択ノードに残るもの**だけ。重複 (from|to|relation) は畳む。

## 正規化マップ (Anatomia → Praeforma code-graph)

| Anatomia | Praeforma |
|---|---|
| NodeKind `file` | node.type `file` |
| NodeKind その他 (function/method/class/module) | node.type `symbol` |
| node.id (AnchorId) | node.key / edge.from・to |
| node.sourceRange.filePath | anatomia_ref.path |
| EdgeKind `calls` | relation `calls` |
| EdgeKind `depends`/`includes` | relation `depends` |
| EdgeKind `implements`/`overrides` | relation `implements` |
| EdgeKind `reads`/`writes`/他 | relation `related` |

## LLM 意味ランキング (opt-in、`THALEIA_LLM_RANK=1`)

構造選択は「ドメイン実装 + 検索語の字面一致」で要件との意味的近さを見ない。`THALEIA_LLM_RANK=1`
のとき、構造候補 (≤300) を `claude -p` に渡し、`requirements`/`query`/対象名への関連が高い順に
上位 `THALEIA_RANK_TOP_K`(既定 40) 件へ絞り込み + 並べ替える (`relay/rank.ts`、claude 呼び出しは
`llm/claude.ts`)。エッジは残ったノード間のみ。summary に `N→M 件に絞り込み` を明示。

- LLM が候補に無い key を返しても捨てる (創作 key を信じない)。重複・topK 超過も除去。
- **既定は off** = 構造選択のみ。これは fallback ではなく文書化された既定モード。
- 有効時に claude 不在/失敗 → `502 { error:"llm_unavailable"|"llm_failed"|.. }` (構造結果へ
  黙って戻さない)。`THALEIA_CLAUDE_BIN` で Windows の git-bash wrapper を差せる。

## 無言フォールバック禁止

- Anatomia 未設定 → `503 anatomia_unconfigured` (mock を返さない)。
- 上流エラー (project 不在で `/api/graph` が 500 等) → `502 upstream_failed`。
- 対象ドメインが検出ドメインに無い / 検索語が何にも当たらない → **空 nodes/edges**を
  返すが、`summary` に理由を明示する (「ドメイン『X』は Anatomia の検出ドメインに無し」等)。
  ダミーグラフを捏造しない。
- 上限切り詰めは `summary` に「候補 N / 上限 300 で切り詰め」と明示 (黙って削らない)。

## v1 の範囲と次フェーズ

- v1 は **構造ベースの絞り込み** (ドメイン実装アンカー + 検索語の字面照合)。`requirements` は
  受け取るが選別には未使用。
- 次フェーズ: `requirements` を使った LLM 意味ランキング (`claude -p`、API 不使用)、
  spec-links を使った関数粒度トレース、scene(layout) target の実体照合。
