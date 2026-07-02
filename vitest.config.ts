import { defineConfig } from 'vitest/config';

// Node 24 では vitest 2.x の既定 pool (forks) が child_process IPC の deserialize で
// クラッシュする (ERR_INVALID_ARG_TYPE、 テスト実行前に落ちる)。 worker_threads pool は
// この経路を通らないため固定する。
export default defineConfig({
  test: { pool: 'threads' },
});
