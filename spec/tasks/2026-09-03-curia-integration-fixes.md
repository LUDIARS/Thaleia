---
task: "curia-integration-fixes"
project: "Thaleia"
kind: "実装"
created: "2026-09-03"
source_session: "lictor-c2481bae-7b5b-4471-bf2c-dffcb509e7f3"
---
# Curia 統合に必要な 2 点の修正 (実行時データの逃がし先 + ドメインマップの命名)

## 目的

Thaleia を Curia (LUDIARS 統合デスクトップスイート) の中で動かせるようにする。
Curia は「Anatomia / Praeforma / Discutere / Thaleia を同時に起動する器」で、施策設計ツールの
5 軸が実際に揃う唯一の環境なので、通し確認はここで行う。その 2 つの前提を潰す。

1. **実行時データがリポジトリに書かれる** — 施策と評価の保存先が
   `src/index.ts` からの相対 (`<repo>/data/`) 固定なので、ランチャー配下で動かすと
   submodule (`Curia/apps/thaleia`) の中に施策 JSON が積まれる。Curia のルールは
   「データ書き込みは userData のみ。submodule 配下に実行時データを書かない」。
2. **Anatomia ドメインマップのファイル名が一時 worktree 名** — PR #1261 は解析を worktree
   `.wt-thaleia-initiative` の中で回したため、`spec/data/domain-map/` に
   `wt-thaleia-initiative.knowledge.jsonl` が入り、`spec/data/generated/anatomia/` の
   entityId も `entrypoint-graph:wt-thaleia-initiative` になっている。worktree はマージ後に
   削除済みで、もう存在しないパスに紐づいた名前が残っている。Anatomia のアンカーは
   解析時のプロジェクト登録 (= 絶対パス) に依存するので、これは再発する既知の落とし穴。

## 実装の要点

- `config.ts` に `dataDir: string | null` を追加し `THALEIA_DATA_DIR` から読む。
  `index.ts` は `config.dataDir ?? <repo>/data` に落とすので**単体起動の挙動は変わらない**。
  `GET /health` はローカルの絶対パスを漏らさず、設定値と既定値のどちらを使ったかだけを
  `dataDirSource` で返す。
- `.gitignore` に `data/initiatives/` を追加 (評価データの実体は持ち出さない)。
- ドメインマップを `thaleia` というプロジェクト id で解析し直し、
  `spec/data/domain-map/thaleia.knowledge.jsonl` を正とした。
  `wt-thaleia-initiative.knowledge.jsonl` は削除。`spec/data/generated/anatomia/` の
  entrypoint-graph / manifest も同時に更新され、worktree 名も絶対パスも残っていない
  (`grep -c 'wt-thaleia' = 0`, `grep -c 'Document.Ars' = 0`)。
- ドメイン: 変更は既存の `service-runtime` (= プロセスとしての Thaleia。起動と設定) に着地する。
  対のテスト置き場として `src/__tests__/` を同ドメインの membership に追加した。

### 再利用探索の採否

`anatomia find --project thaleia --symbol loadConfig` で既存の env 解決 (`firstEnv`) を確認し、
**採用**した。上流 URL と同じ「未設定は null。 勝手な既定値を作らない」規約に `THALEIA_DATA_DIR`
も乗せている (`'   '` のような空白だけの値も未設定と同じ扱いになる)。

## 完了条件

- [x] `THALEIA_DATA_DIR` を指定すると施策と評価がそのディレクトリ配下に書かれる
- [x] 未指定なら従来どおりリポジトリ同梱の `data/` (単体起動の非互換なし)
- [x] `spec/data/domain-map/thaleia.knowledge.jsonl` が存在し、
      `wt-thaleia-initiative.knowledge.jsonl` が消えている
- [x] 生成物に worktree 名と絶対パスが残っていない
- [x] `node <Anatomia>/bin/anatomia.mjs find --project thaleia` で記号が引ける
- [x] `spec/thaleia.md` に env 一覧 (設定) を追記した
- [x] `npm run typecheck` / `npm test` が緑 (22 files / 136 tests)
- [x] `git diff | anatomia verify --project thaleia` が 5 ゲート pass
