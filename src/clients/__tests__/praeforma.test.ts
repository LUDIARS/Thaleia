import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePraeformaClient } from '../praeforma.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Praeforma listSpecs', () => {
  it('既定 50 件で切られないよう limit を明示して取得する', async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      id: `s${index}`,
      code: `SPEC-${index}`,
      title: `title ${index}`,
    }));
    const mockedFetch = vi.fn(async (_input: unknown) =>
      new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', mockedFetch);

    const specs = await makePraeformaClient({ baseUrl: 'https://praeforma.example.test', token: null }).listSpecs('p1');

    expect(specs).toEqual(items);
    expect(mockedFetch.mock.calls[0]![0]).toBe(
      'https://praeforma.example.test/api/projects/p1/specs?limit=500',
    );
  });
});
