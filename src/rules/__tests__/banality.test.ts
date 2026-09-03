import { describe, expect, it } from 'vitest';
import { assessBanality, MATCH_THRESHOLD } from '../banality.ts';
import type { KnownPattern } from '../banality.ts';

const PATTERNS: KnownPattern[] = [
  { source: 'ludus', name: '回避 (ローリング) (features)', text: 'dodge-roll 回避ローリング iframe 無敵時間 combat movement' },
  { source: 'ludus', name: 'インベントリ (features)', text: 'inventory インベントリ 所持品 管理 slot' },
  { source: 'discutere', name: 'コンボ (mechanics/Sample)', text: 'combo コンボ 連携 攻撃' },
];

describe('assessBanality', () => {
  it('既存パターンに当たらなければペナルティ 0', () => {
    const result = assessBanality({
      text: '観測者の視線に応じて地形が書き換わる',
      patterns: PATTERNS,
      penaltyK: 20,
      missing: [],
    });
    expect(result.banality).toBe(0);
    expect(result.penalty).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it('既存パターンと重なるほど凡庸度が上がる', () => {
    const result = assessBanality({
      text: 'dodge-roll 回避ローリング iframe 無敵時間 combat movement を実装する',
      patterns: PATTERNS,
      penaltyK: 20,
      missing: [],
    });
    expect(result.banality).toBeGreaterThan(0);
    expect(result.penalty).toBeGreaterThan(0);
    expect(result.matches[0]?.pattern).toContain('回避');
    expect(result.matches[0]?.similarity).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('該当が多いほど凡庸度が上がる', () => {
    const one = assessBanality({
      text: 'dodge-roll 回避ローリング iframe 無敵時間 combat movement',
      patterns: PATTERNS,
      penaltyK: 20,
      missing: [],
    });
    const many = assessBanality({
      text:
        'dodge-roll 回避ローリング iframe 無敵時間 combat movement ' +
        'inventory インベントリ 所持品 管理 slot combo コンボ 連携 攻撃',
      patterns: PATTERNS,
      penaltyK: 20,
      missing: [],
    });
    expect(many.matches.length).toBeGreaterThan(one.matches.length);
    expect(many.banality).toBeGreaterThan(one.banality);
  });

  it('参照パターンが無ければ黙って 0 にせず missing を積む', () => {
    const result = assessBanality({ text: 'x', patterns: [], penaltyK: 20, missing: [] });
    expect(result.missing.map((m) => m.code)).toContain('banality_no_reference_patterns');
    expect(result.method).toBe('token-overlap');
  });

  it('判定方式を必ず返す (どう測ったかを evidence に残すため)', () => {
    const result = assessBanality({ text: 'dodge roll', patterns: PATTERNS, penaltyK: 20, missing: [] });
    expect(result.method).toBe('token-overlap');
  });
});
