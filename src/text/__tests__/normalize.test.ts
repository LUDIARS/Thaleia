import { describe, expect, it } from 'vitest';
import { normalizeName, overlapCoefficient, tokenize, tokenSet } from '../normalize.ts';

describe('normalizeName', () => {
  it('表記ゆれを同一視する', () => {
    expect(normalizeName('Player Move')).toBe(normalizeName('player-move'));
    expect(normalizeName('spec/links')).toBe(normalizeName('SpecLinks'));
  });

  it('全角と半角を揃える', () => {
    expect(normalizeName('ＵＩ')).toBe('ui');
  });
});

describe('tokenize', () => {
  it('ラテン語彙を小文字で拾う', () => {
    expect(tokenize('Dodge Roll i-frames')).toEqual(['dodge', 'roll', 'i-frames']);
  });

  it('機能語を落とす', () => {
    expect(tokenize('the system of a feature')).toEqual([]);
  });

  it('漢字・カタカナの塊を語として拾い、 ひらがなは拾わない', () => {
    expect(tokenize('回避アクションをする')).toEqual(['回避アクション']);
  });

  it('1 文字の語は拾わない', () => {
    expect(tokenize('a b c 回')).toEqual([]);
  });
});

describe('overlapCoefficient', () => {
  it('小さい方の集合を分母にする', () => {
    const small = tokenSet('dodge roll');
    const large = tokenSet('dodge roll invincible frames stamina cost');
    expect(overlapCoefficient(small, large)).toBe(1);
  });

  it('重なりが無ければ 0', () => {
    expect(overlapCoefficient(tokenSet('dodge roll'), tokenSet('inventory sorting'))).toBe(0);
  });

  it('空集合は 0', () => {
    expect(overlapCoefficient(new Set<string>(), tokenSet('dodge'))).toBe(0);
  });
});
