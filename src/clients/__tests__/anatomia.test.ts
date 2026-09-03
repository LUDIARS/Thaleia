import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeAnatomiaClient } from '../anatomia.ts';
import { fetchWithTimeout } from '../fetch.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Anatomia entrypoint graph contract', () => {
  it('EntryPointViewPayload の graphNodes / graphEdges を読む', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      entries: [{ id: 'entry', symbol: { name: 'mountRoutes' } }],
      graphNodes: [{ anchor: 'from', name: 'caller', path: 'src/a.ts', reachedFrom: ['entry'] }],
      graphEdges: [{ from: 'from', to: 'to' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await makeAnatomiaClient({ baseUrl: 'http://127.0.0.1:4200' })
      .fetchEntrypointGraph('project');

    expect(result.entries).toEqual([{ id: 'entry', name: 'mountRoutes' }]);
    expect(result.nodes).toEqual([{ id: 'from', name: 'caller', path: 'src/a.ts', reachedFrom: ['entry'] }]);
    expect(result.edges).toEqual([{ from: 'from', to: 'to' }]);
  });
});

describe('fetchWithTimeout', () => {
  it('呼び出し側に signal が無くても deadline を設定する', async () => {
    const mockedFetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', mockedFetch);

    await fetchWithTimeout('http://127.0.0.1/');

    expect(mockedFetch).toHaveBeenCalledOnce();
  });
});
