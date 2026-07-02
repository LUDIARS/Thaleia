import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSnapshotStore } from '../snapshot.ts';
import type { ReconcileResult } from '../../reconcile/types.ts';

function make(over: Partial<ReconcileResult>): ReconcileResult {
  return {
    project: 'demo',
    pfProjectId: '',
    anatomiaProject: '',
    generatedAt: '2026-07-02T00:00:00.000Z',
    domainMatches: [],
    sceneMatches: [],
    specCoverage: [],
    gaps: { specsWithoutImpl: [], codeDomainsWithoutSpec: [], codeScreensWithoutSpec: [] },
    summary: {
      pfDomains: 0, anatomiaDomains: 0, matchedDomains: 0,
      pfScenes: 0, anatomiaScreens: 0, matchedScenes: 0,
      specs: 0, implementedSpecs: 0,
    },
    ...over,
  };
}

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'thaleia-snapshot-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('makeSnapshotStore', () => {
  it('save→load→loadPrevious の round-trip (2 回目の save で 1 回目が previous になる)', async () => {
    const store = makeSnapshotStore(dataDir);
    const first = make({ generatedAt: '2026-07-01T00:00:00.000Z', summary: { ...make({}).summary, specs: 1 } });
    const second = make({ generatedAt: '2026-07-02T00:00:00.000Z', summary: { ...make({}).summary, specs: 2 } });

    await store.save(first);
    expect(await store.load('demo')).toEqual(first);
    expect(await store.loadPrevious('demo')).toBeNull();

    await store.save(second);
    expect(await store.load('demo')).toEqual(second);
    expect(await store.loadPrevious('demo')).toEqual(first);
  });

  it('並行 save (同一 label) でも history が壊れない — 全 run が最新 or history に揃う', async () => {
    const store = makeSnapshotStore(dataDir);
    const runs = Array.from({ length: 8 }, (_, i) =>
      make({ generatedAt: `2026-07-02T00:00:0${i}.000Z` }),
    );
    await Promise.all(runs.map((r) => store.save(r)));

    const latest = await store.load('demo');
    expect(latest).not.toBeNull();
    const latestAt = latest?.generatedAt;

    const historyFiles = (await readdir(join(dataDir, 'history', 'demo'))).filter((f) =>
      f.endsWith('.json'),
    );
    // 8 回 save → 最新 1 + history 7。 退避競合があると history が欠ける/重複上書きされる。
    expect(historyFiles).toHaveLength(runs.length - 1);

    const archivedAts = await Promise.all(
      historyFiles.map(async (f) => {
        const parsed = JSON.parse(
          await readFile(join(dataDir, 'history', 'demo', f), 'utf8'),
        ) as ReconcileResult;
        return parsed.generatedAt;
      }),
    );
    const all = new Set([latestAt, ...archivedAts]);
    expect(all).toEqual(new Set(runs.map((r) => r.generatedAt)));
  });

  it('破損 JSON の既存最新は corrupt-*.json として history へ退避され warn される', async () => {
    const store = makeSnapshotStore(dataDir);
    const corruptRaw = '{ this is not json';
    await writeFile(join(dataDir, 'demo.json'), corruptRaw, 'utf8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fresh = make({});
      await store.save(fresh);

      expect(await store.load('demo')).toEqual(fresh);
      const historyFiles = await readdir(join(dataDir, 'history', 'demo'));
      const corrupt = historyFiles.filter((f) => f.startsWith('corrupt-') && f.endsWith('.json'));
      expect(corrupt).toHaveLength(1);
      // 生バイトがそのまま退避される (捜査可能に)。
      expect(await readFile(join(dataDir, 'history', 'demo', corrupt[0]!), 'utf8')).toBe(corruptRaw);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('corrupt 退避は loadPrevious の対象にならない (前回 run として拾わない)', async () => {
    const store = makeSnapshotStore(dataDir);
    await writeFile(join(dataDir, 'demo.json'), 'broken!!', 'utf8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const first = make({ generatedAt: '2026-07-01T00:00:00.000Z' });
      const second = make({ generatedAt: '2026-07-02T00:00:00.000Z' });
      await store.save(first); // 破損分が corrupt 退避される
      await store.save(second); // first が通常退避される

      // corrupt- は ASCII で timestamp より後ろに sort されるが、 previous としては first を返す。
      expect(await store.loadPrevious('demo')).toEqual(first);
    } finally {
      warn.mockRestore();
    }
  });

  it('真の初回 (ENOENT) は warn なしで保存し history を作らない', async () => {
    const store = makeSnapshotStore(dataDir);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await store.save(make({}));
      expect(warn).not.toHaveBeenCalled();
      await expect(readdir(join(dataDir, 'history', 'demo'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('save 後に tmp ファイルが残らない (原子的置換)', async () => {
    const store = makeSnapshotStore(dataDir);
    await store.save(make({}));
    const files = await readdir(dataDir);
    expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(files).toContain('demo.json');
  });
});
