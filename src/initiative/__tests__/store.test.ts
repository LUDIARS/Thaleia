import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeInitiativeStore } from '../store.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('makeInitiativeStore', () => {
  it('同じ時刻に同じ日本語タイトルを登録しても上書きしない', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'thaleia-store-'));
    temporaryDirectories.push(dataDir);
    const store = makeInitiativeStore(dataDir);
    const input = { title: '日本語の施策', kind: 'new-content' as const, project: 'project', body: '本文' };
    const now = '2026-09-03T02:33:20.000Z';

    const first = await store.create(input, now);
    const second = await store.create(input, now);

    expect(second.id).not.toBe(first.id);
    await expect(store.get(first.id)).resolves.toMatchObject({ id: first.id });
    await expect(store.get(second.id)).resolves.toMatchObject({ id: second.id });
  });

  it('壊れた既存 JSON を存在しない記録として隠さない', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'thaleia-store-'));
    temporaryDirectories.push(dataDir);
    const store = makeInitiativeStore(dataDir);
    const id = 'broken-initiative';
    const root = join(dataDir, 'initiatives');
    await mkdir(root, { recursive: true });
    await writeFile(join(root, `${id}.json`), '{broken', 'utf8');

    await expect(store.get(id)).rejects.toBeInstanceOf(SyntaxError);
  });

  it('パス区切りを含む id ではデータ領域外を読まない', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'thaleia-store-'));
    temporaryDirectories.push(dataDir);
    const store = makeInitiativeStore(dataDir);

    await expect(store.get('../outside')).resolves.toBeNull();
  });
});
