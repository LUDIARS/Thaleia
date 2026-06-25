// 突合スナップショットの JSON 永続化 (data/<slug>.json)。
// Thaleia は「統合したデータを持つ」サービスなので、 最新の突合結果を保存して引けるようにする。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReconcileResult } from '../reconcile/types.ts';

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
}

export interface SnapshotStore {
  save(result: ReconcileResult): Promise<string>;
  load(label: string): Promise<ReconcileResult | null>;
}

export function makeSnapshotStore(dataDir: string): SnapshotStore {
  return {
    async save(result) {
      await mkdir(dataDir, { recursive: true });
      const file = join(dataDir, `${slug(result.project)}.json`);
      await writeFile(file, JSON.stringify(result, null, 2), 'utf8');
      return file;
    },
    async load(label) {
      const file = join(dataDir, `${slug(label)}.json`);
      try {
        return JSON.parse(await readFile(file, 'utf8')) as ReconcileResult;
      } catch {
        return null;
      }
    },
  };
}
