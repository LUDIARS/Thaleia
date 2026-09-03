// 評価エンジンが共有する依存。 I/O はすべてここを通す (純粋層はこの型を知らない)。

import type { AnatomiaClient } from '../clients/anatomia.ts';
import type { AugurClient } from '../clients/augur.ts';
import type { DiscutereClient } from '../clients/discutere.ts';
import type { GeniusClient } from '../clients/genius.ts';
import type { LudusClient } from '../clients/ludus.ts';
import type { ClaudeRunner } from '../llm/claude.ts';
import type { Initiative } from '../initiative/types.ts';
import type { ThaleiaConfig } from '../config.ts';

/**
 * 上流はどれも「設定されていない」ことがある。 その場合 client は null で渡り、
 * 各軸は 0 点ではなく missing を積む (設計 §4 の共通方針)。
 */
export interface EvaluatorDeps {
  config: ThaleiaConfig;
  anatomia: AnatomiaClient | null;
  discutere: DiscutereClient | null;
  augur: AugurClient | null;
  genius: GeniusClient | null;
  ludus: LudusClient | null;
  /** LLM。 未設定はありえない (claude CLI は既定 'claude') が、 失敗は missing になる。 */
  llm: ClaudeRunner;
  /** data/ のルート (ペルソナ閾値の上書きを読む)。 */
  dataDir: string;
}

/** 評価 1 回ぶんの入力。 */
export interface EvaluationContext {
  deps: EvaluatorDeps;
  initiative: Initiative;
}

/** 上流未設定の missing を作る (文面をここで統一する)。 */
export function unconfigured(service: string, envKey: string): { code: string; reason: string } {
  return {
    code: `${service}_unconfigured`,
    reason: `${service} が未設定のため参照できない (${envKey} を設定してください)`,
  };
}
