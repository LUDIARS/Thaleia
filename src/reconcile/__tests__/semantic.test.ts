import { describe, it, expect } from 'vitest';
import { parseSemanticPairs, buildSemanticPrompt } from '../semantic.ts';
import { reconcile } from '../match.ts';

describe('parseSemanticPairs', () => {
  const pf = ['戦闘', '所持品'];
  const an = ['combat', 'inventory'];

  it('入力名に実在し confidence 下限以上のペアだけ採る', () => {
    const raw = '{"pairs":[{"pf":"戦闘","an":"combat","confidence":0.9},{"pf":"所持品","an":"inventory","confidence":0.3}]}';
    const pairs = parseSemanticPairs(raw, pf, an);
    expect(pairs).toEqual([{ pf: '戦闘', an: 'combat', confidence: 0.9 }]); // 0.3 は下限未満で落ちる
  });

  it('創作名 (入力に無い) は捨てる', () => {
    const raw = '{"pairs":[{"pf":"幽霊","an":"ghost","confidence":0.99}]}';
    expect(parseSemanticPairs(raw, pf, an)).toEqual([]);
  });

  it('1:1 — 同じ pf/an の重複は高 confidence を優先', () => {
    const raw = '{"pairs":[{"pf":"戦闘","an":"combat","confidence":0.6},{"pf":"戦闘","an":"inventory","confidence":0.9}]}';
    const pairs = parseSemanticPairs(raw, pf, an);
    expect(pairs).toEqual([{ pf: '戦闘', an: 'inventory', confidence: 0.9 }]);
  });

  it('プロンプトに両側リストと出力形を載せる', () => {
    const p = buildSemanticPrompt(pf, an, 'ドメイン');
    expect(p).toContain('戦闘');
    expect(p).toContain('combat');
    expect(p).toContain('"pairs"');
  });
});

describe('reconcile — 意味照合 alias', () => {
  it('alias で spec-only/code-only が name-mismatch(semantic) に変わる', () => {
    const r = reconcile({
      project: 'demo',
      pfDomains: [{ id: 'd1', name: '戦闘' }],
      pfSpecs: [{ id: 's1', code: 'SP-1', title: '戦う', targetDomains: ['戦闘'] }],
      anatomiaDomains: [{ name: 'combat', implementorCount: 4 }],
      domainAliases: [{ pf: '戦闘', an: 'combat' }],
    });
    const row = r.domainMatches.find((m) => m.pfDomain === '戦闘');
    expect(row).toMatchObject({ pfDomain: '戦闘', anatomiaDomain: 'combat', status: 'name-mismatch', semantic: true });
    // code-only に combat は残らない (対応付いた)。
    expect(r.gaps.codeDomainsWithoutSpec).not.toContain('combat');
    // 仕様も実装済になる。
    expect(r.specCoverage.find((s) => s.specCode === 'SP-1')?.implemented).toBe(true);
  });

  it('alias 無しなら従来通り spec-only / code-only に分かれる', () => {
    const r = reconcile({
      project: 'demo',
      pfDomains: [{ id: 'd1', name: '戦闘' }],
      pfSpecs: [],
      anatomiaDomains: [{ name: 'combat', implementorCount: 4 }],
    });
    expect(r.domainMatches.find((m) => m.pfDomain === '戦闘')?.status).toBe('spec-only');
    expect(r.gaps.codeDomainsWithoutSpec).toContain('combat');
  });
});
