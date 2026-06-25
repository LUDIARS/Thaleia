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

/** ISO timestamp を Windows でも安全なファイル名にする (`:`/`.` を `-`)。 */
function stampToFile(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

export interface SnapshotStore {
  /** 最新を保存し、 直前の最新を history へ退避する (前回比の素材)。 */
  save(result: ReconcileResult): Promise<string>;
  load(label: string): Promise<ReconcileResult | null>;
  /** 直前の最新 (= 今回保存で history へ退避された 1 つ前の run)。 無ければ null。 */
  loadPrevious(label: string): Promise<ReconcileResult | null>;
  /** 保存済みスナップショットのサマリ一覧 (新しい順)。 トップ画面のカード用。 */
  list(): Promise<SnapshotSummary[]>;
}

export function makeSnapshotStore(dataDir: string): SnapshotStore {
  const historyDir = (label: string) => join(dataDir, 'history', slug(label));

  return {
    async save(result) {
      await mkdir(dataDir, { recursive: true });
      const file = join(dataDir, `${slug(result.project)}.json`);
      // 既存の最新を history へ退避してから上書き (前回比の素材を残す)。
      try {
        const prevRaw = await readFile(file, 'utf8');
        const prev = JSON.parse(prevRaw) as ReconcileResult;
        const hd = historyDir(result.project);
        await mkdir(hd, { recursive: true });
        const stamp = stampToFile(prev.generatedAt ?? 'unknown');
        await writeFile(join(hd, `${stamp}.json`), prevRaw, 'utf8');
      } catch {
        // 既存無し (初回) は退避しない。
      }
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
    async loadPrevious(label) {
      const hd = historyDir(label);
      let files: string[];
      try {
        files = (await readdir(hd)).filter((f) => f.endsWith('.json'));
      } catch {
        return null;
      }
      // ファイル名 = sanitized generatedAt なので辞書順最大 = 最新。
      files.sort();
      const newest = files[files.length - 1];
      if (!newest) return null;
      try {
        return JSON.parse(await readFile(join(hd, newest), 'utf8')) as ReconcileResult;
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
            // 旧スナップショットは codeScreensWithoutSpec 無し → ?? [] で安全に。
            gapCount:
              r.gaps.specsWithoutImpl.length +
              r.gaps.codeDomainsWithoutSpec.length +
              (r.gaps.codeScreensWithoutSpec ?? []).length,
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
