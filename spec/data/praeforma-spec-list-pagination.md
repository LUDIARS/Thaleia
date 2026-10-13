# Praeforma 仕様一覧の取得上限

Praeforma の仕様一覧 API は、`limit` を省略すると既定件数で応答を切り詰める。
Thaleia の統合ビューと仕様起点トレースは一覧を入力として使うため、クライアントは
`GET /api/projects/:pid/specs?limit=500` を要求する。

この変更の回帰テストは `src/clients/__tests__/praeforma.test.ts` に置き、クライアントが
取得上限を明示することを検証する。個別プロジェクトの識別子、非公開仕様、取得結果は
リポジトリへ保存しない。
