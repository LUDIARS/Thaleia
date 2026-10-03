import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Lapilli owns its workspace tests, including suites using node:test.
    // Keep Vitest's defaults and all of Thaleia's existing test discovery.
    exclude: [...configDefaults.exclude, 'lib/lapilli/**'],
  },
});
