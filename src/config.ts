// 起動時 env 解決。 上流 URL/token は未設定でも起動する (= /health は返す)。
// 評価リクエスト時に未設定なら mock に落とさず、 その軸を missing にする (無言 fallback 禁止)。

import type { AxisWeights } from './initiative/types.ts';

/** 総合スコアの重み既定値 (設計 §5)。 */
export const DEFAULT_WEIGHTS: AxisWeights = {
  ux: 0.25,
  cost: 0.15,
  'ai-feasibility': 0.2,
  domain: 0.15,
  discussion: 0.25,
};

/** 見送り閾値の既定値 (設計 §8-4 A 案)。 */
export const DEFAULT_DEFER_THRESHOLD = 0.7;

/** 凡庸性ペナルティ係数の既定値 (banality 1.0 で total から 20 点引く)。 */
export const DEFAULT_BANALITY_K = 20;

/** ペルソナ内部スコアの重み既定値 (設計 §4.5(c))。 */
export const DEFAULT_PERSONA_WEIGHTS = { opinion: 0.4, consensus: 0.4, traitFit: 0.2 };

export interface ThaleiaConfig {
  port: number;
  /** Anatomia (コード解析) の web server base URL。 例 http://localhost:4200 */
  anatomiaBaseUrl: string | null;
  /** Discutere (議論) の base URL。 例 http://localhost:3110 */
  discutereBaseUrl: string | null;
  /** Discutere admin REST 用の X-User-Id。 未設定なら loopback admin に任せる。 */
  discutereUserId: string | null;
  /** Genius (判断カード) の base URL。 例 http://localhost:4230 */
  geniusBaseUrl: string | null;
  /** Augur CLI の entry point (`node <bin> review-plan`)。 例 C:/path/to/Augur/bin/augur.mjs */
  augurBin: string | null;
  /** Ludus リポのルート (game-lexicon の TOML を直接読む)。 */
  ludusRepoDir: string | null;
  /** Praeforma (人間の仕様) の base URL。 spec 起点トレース / 統合ビューで使う。 */
  praeformaBaseUrl: string | null;
  /** Praeforma API 用 Cernere service token。 */
  praeformaToken: string | null;
  /** ディープリンク先 (未設定ならリンクを出さず素のテキストにする)。 */
  praeformaWebUrl: string | null;
  anatomiaWebUrl: string | null;
  discutereWebUrl: string | null;
  geniusWebUrl: string | null;
  /** LLM 呼び出しに使う claude CLI。 Windows は git-bash wrapper を差せる。 */
  claudeBin: string;
  /** claude CLI に固定で渡すモデル。 既定任せは上限切れで無言終了するので必ず固定する。 */
  claudeModel: string;
  /** LLM 1 回あたりの timeout (ms)。 */
  claudeTimeoutMs: number;
  /** 総合スコアの重み。 */
  weights: AxisWeights;
  /** 見送り閾値 (0..1)。 */
  deferThreshold: number;
  /** 凡庸性ペナルティ係数。 */
  banalityK: number;
  /**
   * spec-link ワークリストで「低 confidence」とみなす閾値 (この値未満を要レビュー扱い)。
   * THALEIA_LINK_CONFIDENCE_THRESHOLD で opt-in 変更可。 既定 0.7。
   */
  linkConfidenceThreshold: number;
}

export function loadConfig(): ThaleiaConfig {
  return {
    port: Number(process.env.THALEIA_PORT ?? 8890),
    anatomiaBaseUrl: firstEnv('ANATOMIA_BASE_URL', 'ANATOMIA_API_URL', 'ANATOMIA_URL'),
    discutereBaseUrl: firstEnv('DISCUTERE_BASE_URL', 'DISCUTERE_URL'),
    discutereUserId: firstEnv('DISCUTERE_ADMIN_USER_ID'),
    geniusBaseUrl: firstEnv('GENIUS_BASE_URL', 'GENIUS_URL'),
    augurBin: firstEnv('AUGUR_BIN'),
    ludusRepoDir: firstEnv('LUDUS_REPO_DIR'),
    praeformaBaseUrl: firstEnv('PRAEFORMA_BASE_URL', 'PRAEFORMA_API_URL', 'PRAEFORMA_URL'),
    praeformaToken: process.env.PRAEFORMA_TOKEN ?? null,
    praeformaWebUrl: firstEnv('PRAEFORMA_WEB_URL'),
    // Anatomia / Discutere / Genius は web server 自身が UI も兼ねるので、
    // 専用 URL 未設定なら API base を流用する。
    anatomiaWebUrl:
      firstEnv('ANATOMIA_WEB_URL') ?? firstEnv('ANATOMIA_BASE_URL', 'ANATOMIA_API_URL', 'ANATOMIA_URL'),
    discutereWebUrl: firstEnv('DISCUTERE_WEB_URL') ?? firstEnv('DISCUTERE_BASE_URL', 'DISCUTERE_URL'),
    geniusWebUrl: firstEnv('GENIUS_WEB_URL') ?? firstEnv('GENIUS_BASE_URL', 'GENIUS_URL'),
    claudeBin: process.env.THALEIA_CLAUDE_BIN ?? 'claude',
    claudeModel: process.env.THALEIA_CLAUDE_MODEL ?? 'claude-sonnet-5',
    claudeTimeoutMs: positiveInt(process.env.THALEIA_CLAUDE_TIMEOUT_MS, 120_000),
    weights: loadWeights(),
    deferThreshold: unitInterval(process.env.THALEIA_DEFER_THRESHOLD, DEFAULT_DEFER_THRESHOLD),
    banalityK: positiveInt(process.env.THALEIA_BANALITY_K, DEFAULT_BANALITY_K),
    linkConfidenceThreshold: unitInterval(process.env.THALEIA_LINK_CONFIDENCE_THRESHOLD, 0.7),
  };
}

/** 指定した環境変数キーを順に見て、 最初に値が入っているものを返す。 */
function firstEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

/** 0..1 の閾値を解釈。 未設定/不正値は既定値。 */
function unitInterval(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

/** 正の数を解釈。 未設定/不正値は既定値。 */
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * 軸の重みを env で上書きする (THALEIA_WEIGHT_UX 等)。
 * 1 本でも上書きされたら全体を正規化して合計 1 に保つ (重み比だけを設定させる)。
 */
function loadWeights(): AxisWeights {
  const overridden: AxisWeights = {
    ux: positiveOrNull(process.env.THALEIA_WEIGHT_UX) ?? DEFAULT_WEIGHTS.ux,
    cost: positiveOrNull(process.env.THALEIA_WEIGHT_COST) ?? DEFAULT_WEIGHTS.cost,
    'ai-feasibility':
      positiveOrNull(process.env.THALEIA_WEIGHT_AI_FEASIBILITY) ?? DEFAULT_WEIGHTS['ai-feasibility'],
    domain: positiveOrNull(process.env.THALEIA_WEIGHT_DOMAIN) ?? DEFAULT_WEIGHTS.domain,
    discussion: positiveOrNull(process.env.THALEIA_WEIGHT_DISCUSSION) ?? DEFAULT_WEIGHTS.discussion,
  };
  const sum = Object.values(overridden).reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return {
    ux: overridden.ux / sum,
    cost: overridden.cost / sum,
    'ai-feasibility': overridden['ai-feasibility'] / sum,
    domain: overridden.domain / sum,
    discussion: overridden.discussion / sum,
  };
}

function positiveOrNull(raw: string | undefined): number | null {
  const n = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(n) || n < 0) return null;
  return n;
}
