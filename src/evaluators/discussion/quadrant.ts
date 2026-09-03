// 四象限マトリクスの純粋ロジック (設計 §4.5(b)、§8-1 A 案で軸確定)。
//
//   X = 実現性 (そのペルソナが「作れる / 壊れない」と見ているか)  −1..+1
//   Y = 体験価値 (そのペルソナが「面白い / 意図した体験になる」と見ているか) −1..+1
//
//                    体験価値 高
//                        │
//      [II 条件付き推進]  │  [I 推進]
//    実現性 低 ──────────┼────────── 実現性 高
//      [IV 却下]          │  [III 再考]
//                        │
//                    体験価値 低
//
// 発話 → 2 軸の写像は LLM (engine 側) が行い、 ここは写像済みの値を象限に割るだけ。
// 境界 (0) はどちらにも倒せてしまうので「0 以上を高」と決め打つ (決定的に再現するため)。

import type { Quadrant } from '../../initiative/types.ts';

/** LLM が返す 1 ペルソナぶんの写像。 */
export interface PersonaAxisMapping {
  personaId: string;
  /** X: 実現性 −1..+1。 */
  feasibility: number;
  /** Y: 体験価値 −1..+1。 */
  experienceValue: number;
}

/** −1..+1 に丸める。 */
export function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, Math.round(value * 1000) / 1000));
}

/** 2 軸から象限を決める。 */
export function toQuadrant(feasibility: number, experienceValue: number): Quadrant {
  const highFeasibility = clampAxis(feasibility) >= 0;
  const highValue = clampAxis(experienceValue) >= 0;
  if (highValue && highFeasibility) return 'I';
  if (highValue && !highFeasibility) return 'II';
  if (!highValue && highFeasibility) return 'III';
  return 'IV';
}

/** 象限ごとのペルソナ数。 */
export function countQuadrants(quadrants: readonly Quadrant[]): Record<Quadrant, number> {
  const counts: Record<Quadrant, number> = { I: 0, II: 0, III: 0, IV: 0 };
  for (const q of quadrants) counts[q] += 1;
  return counts;
}

/** 象限 I が過半か (加点条件)。 */
export function hasQuadrantOneMajority(counts: Record<Quadrant, number>): boolean {
  const total = counts.I + counts.II + counts.III + counts.IV;
  if (total === 0) return false;
  return counts.I * 2 > total;
}
