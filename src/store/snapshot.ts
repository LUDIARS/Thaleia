// 突合スナップショットの JSON 永続化 (data/<slug>.json)。
// Thaleia は「統合したデータを持つ」サービスなので、 最新の突合結果を保存して引けるようにする。

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
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
  // slug ごとの save 直列化 (軽量 mutex)。 同一 label への並行 POST で
  // 「既存読み → history 退避 → 上書き」 が交錯して退避が失われるのを防ぐ。
  const saveChains = new Map<string, Promise<unknown>>();
  function serializeBySlug<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = saveChains.get(key) ?? Promise.resolve();
    // 前の save が失敗していても次の save は実行する (エラーは各呼び出し元へ返る)。
    const run = prev.then(task, task);
    saveChains.set(key, run.catch(() => undefined));
    return run;
  }

  /** 既存の最新を history へ退避する。 破損 JSON は corrupt-<stamp>.json として生バイトを残す。 */
  async function archivePrevious(file: string, project: string): Promise<void> {
    let prevRaw: string;
    try {
      prevRaw = await readFile(file, 'utf8');
    } catch (err) {
      // 真の初回 (ENOENT) のみ退避なしで続行。 それ以外の read 失敗は無言で握り潰さない。
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    const hd = historyDir(project);
    await mkdir(hd, { recursive: true });
    let archiveName: string;
    try {
      const prev = JSON.parse(prevRaw) as ReconcileResult;
      archiveName = `${stampToFile(prev.generatedAt ?? 'unknown')}.json`;
    } catch {
      // parse 失敗 = 破損。 初回扱いで無退避上書きせず、 生バイトを corrupt として退避して観測可能にする。
      archiveName = `corrupt-${stampToFile(new Date().toISOString())}.json`;
      console.warn(
        `[thaleia:store] 既存スナップショット ${file} の JSON が破損しています。 history へ ${archiveName} として退避して上書きします。`,
      );
    }
    await writeFile(join(hd, archiveName), prevRaw, 'utf8');
  }

  return {
    save(result) {
      const key = slug(result.project);
      return serializeBySlug(key, async () => {
        await mkdir(dataDir, { recursive: true });
        const file = join(dataDir, `${key}.json`);
        await archivePrevious(file, result.project);
        // 原子的置換: 同一ディレクトリに tmp を書いて rename (途中状態の最新ファイルを見せない)。
        const tmp = join(dataDir, `.${key}.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
        await writeFile(tmp, JSON.stringify(result, null, 2), 'utf8');
        await rename(tmp, file);
        return file;
      });
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
        // corrupt-*.json は破損退避なので前回 run としては扱わない。
        files = (await readdir(hd)).filter((f) => f.endsWith('.json') && !f.startsWith('corrupt-'));
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
