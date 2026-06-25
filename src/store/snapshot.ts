// 突合スナップショットの JSON 永続化 (data/<slug>.json)。
// Thaleia は「統合したデータを持つ」サービスなので、 最新の突合結果を保存して引けるようにする。

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReconcileResult } from '../reconcile/types.ts';

/** 一覧表示用の軽量サマリ (突合結果のヘッダ部だけ)。 */
export interface SnapshotSummary {
  project: string;
  generatedAt: string | null;
  pfProjectId: string;
  anatomiaProject: string;
  summary: ReconcileResult['summary'];
  gapCount: number;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
}

export interface SnapshotStore {
  save(result: ReconcileResult): Promise<string>;
  load(label: string): Promise<ReconcileResult | null>;
  /** 保存済みスナップショットのサマリ一覧 (新しい順)。 トップ画面のカード用。 */
  list(): Promise<SnapshotSummary[]>;
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
    async list() {
      let files: string[];
      try {
        files = (await readdir(dataDir)).filter((f) => f.endsWith('.json'));
      } catch {
        return [];
      }
      const summaries: SnapshotSummary[] = [];
      for (const f of files) {
        try {
          const r = JSON.parse(await readFile(join(dataDir, f), 'utf8')) as ReconcileResult;
          summaries.push({
            project: r.project,
            generatedAt: r.generatedAt,
            pfProjectId: r.pfProjectId ?? '',
            anatomiaProject: r.anatomiaProject ?? '',
            summary: r.summary,
            gapCount: r.gaps.specsWithoutImpl.length + r.gaps.codeDomainsWithoutSpec.length,
          });
        } catch {
          // 壊れた/旧形式の JSON は一覧から黙って除外せず skip するが、 個別 load では拾える。
        }
      }
      // 新しい順 (generatedAt 降順、 null は末尾)。
      return summaries.sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));
    },
  };
}
