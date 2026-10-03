# 共通の単発CLI起動

necoの全リポジトリ共通化依頼（2026-10-03）に対応。
`llm-assist` はLapilliの `@ludiars/one-shot` からClaudeを起動する。
モデル既定値はSonnetロールを共通定義で具体的なIDへ解決し、明示設定は維持する。
stdin、応答解析、120秒の期限、例外契約はThaleiaが所有する。
CLIの失敗を成功に変換せず、APIキーへの自動切替を行わない。
復旧は本変更とLapilli依存の固定版を一緒に戻す。
テスト・実推論・サービス再起動はこのセッションでは実施しない。

新規 checkout では npm install 前に `git submodule update --init -- lib/lapilli`
を実行する。Revisor の登録済み準備処理にも `lapilli-submodules` を追加し、
同一端末の Lapilli リポジトリから gitlink の固定コミットを取得する。
既存の install / test / typecheck は維持する。
Vitest は依存先 `lib/lapilli` を収集対象外にする。Lapilli の Node 標準テストは
Lapilli 側の審査が所有し、Thaleia の既存テストの収集範囲は維持する。
