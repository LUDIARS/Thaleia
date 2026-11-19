# 共通の単発CLI起動

necoの全リポジトリ共通化依頼（2026-10-03）に対応。
`llm-assist` はLapilliの `@ludiars/one-shot` からClaudeを起動する。
Actio: `actio:4d8078c7-142e-432b-8740-6d80568b97ed`。
`THALEIA_CLAUDE_MODEL` の既定値と設定例は `sonnet`。
Claude の役割名は Lapilli が実行直前に Concordia のモデル役割マップで解決する。
マップに対応値がない場合、Lapilli は Claude CLI が対応する役割名をそのまま渡す。
明示的に設定したモデル ID はそのまま CLI に渡す。
stdin、応答解析、120秒の期限、例外契約はThaleiaが所有する。
CLIの失敗を成功に変換せず、APIキーへの自動切替を行わない。
復旧は本変更とLapilli依存の固定版を一緒に戻す。

新規 checkout では npm install 前に `git submodule update --init -- lib/lapilli`
を実行する。Revisor の登録済み準備処理にも `lapilli-submodules` を追加し、
同一端末の Lapilli リポジトリから gitlink の固定コミットを取得する。
既存の install / test / typecheck は維持する。
Vitest は依存先 `lib/lapilli` を収集対象外にする。Lapilli の Node 標準テストは
Lapilli 側の審査が所有し、Thaleia の既存テストの収集範囲は維持する。
