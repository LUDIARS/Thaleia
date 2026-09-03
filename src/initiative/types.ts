// 施策 (Initiative) と評価結果のドメインモデル。 どの上流にも依存しない純粋な型定義。
//
// 設計: spec/plan/2026-09-03-thaleia-initiative-design-tool.md (Castra) §2〜§5。
// 「企画を入れると、 成否リスクのスコアと根拠と可視化が出る」評価専用サービスの中核データ。

/** 施策の種別。 評価ルールが分岐する。 */
export type InitiativeKind = 'new-content' | 'improvement';

/** 評価軸の識別子。 */
export type AxisId = 'ux' | 'cost' | 'ai-feasibility' | 'domain' | 'discussion';

/** 全評価軸 (集計・表示の順序をここで固定する)。 */
export const AXIS_IDS: readonly AxisId[] = ['ux', 'cost', 'ai-feasibility', 'domain', 'discussion'];

/** 判定。 defer = 見送り (改善タスクのデグレード危険度が閾値を超えたとき)。 */
export type Verdict = 'go' | 'conditional' | 'defer' | 'no-go';

/** 施策の登録入力 (POST /api/initiatives)。 */
export interface InitiativeInput {
  title: string;
  kind: InitiativeKind;
  /** Anatomia の project id。 実装先。 */
  project: string;
  /** 企画本文 (Markdown)。 LLM に載るので個人情報は載せない。 */
  body: string;
  /** Di の議論 gap。 未指定なら評価時に Thaleia が起票する (§8-6 A 案)。 */
  discutere?: { gapId?: string | null } | null;
  /** new-content の凡庸性判定に使う Ludus/Di 側のゲーム id。 */
  ludus?: { gameId?: string | null } | null;
  /**
   * 対象リポジトリのローカルパス。 Augur CLI (`--repo`) が要るので受ける。
   * 未指定なら Augur 由来の signal は missing になる (無言で 0 点にはしない)。
   */
  repoPath?: string | null;
}

/** 保存された施策。 */
export interface Initiative extends InitiativeInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** 根拠 1 件。 ビューアはここからディープリンクを張る。 */
export interface Evidence {
  /** どの上流由来か。 thaleia = Thaleia の算出そのもの。 */
  source: 'anatomia' | 'discutere' | 'augur' | 'genius' | 'ludus' | 'llm' | 'thaleia';
  /** 見出し (一覧に出る短い文)。 */
  label: string;
  /** 補足 (数値の内訳など)。 */
  detail?: string;
  /** 上流 UI へのディープリンク。 web URL 未設定なら null。 */
  url?: string | null;
}

/** 取れなかった上流 1 件。 confidence を下げる根拠になる。 */
export interface Missing {
  /** 機械可読キー (例 anatomia_hotspots_unavailable)。 */
  code: string;
  /** 人が読む理由。 */
  reason: string;
}

/** 評価軸 1 本の結果。 */
export interface AxisResult {
  axis: AxisId;
  /** 0..100。 上流が取れなくても 0 にはせず missing を積んで confidence を落とす。 */
  score: number;
  /** 0..1。 */
  confidence: number;
  evidence: Evidence[];
  missing: Missing[];
}

/** 四象限。 I=推進 / II=条件付き推進 / III=再考 / IV=却下。 */
export type Quadrant = 'I' | 'II' | 'III' | 'IV';

/** ペルソナ 1 人の評価 (四象限 + 内部スコア + 合否)。 */
export interface PersonaEvaluation {
  personaId: string;
  displayName: string;
  traits: string[];
  /** X = 実現性 (-1..+1)。 */
  feasibility: number;
  /** Y = 体験価値 (-1..+1)。 */
  experienceValue: number;
  quadrant: Quadrant;
  /** 内部スコアの内訳。 */
  breakdown: {
    /** 正規化した opinionScore (0..1)。 */
    opinion: number;
    /** 正規化した consensusScore (0..1)。 */
    consensus: number;
    /** traits と施策 kind の相性 (0..1)。 */
    traitFit: number;
  };
  /** 内部スコア 0..100。 */
  internal: number;
  /** このペルソナ固有の合格閾値 0..100。 */
  threshold: number;
  pass: boolean;
  /** 発話 (ビューアの内訳表示用)。 */
  utterances: Array<{ id: string; content: string; agree: boolean | null; score: number | null }>;
}

/** Di 議論軸の内訳 (四象限の可視化に使う)。 */
export interface DiscussionDetail {
  gapId: string | null;
  personas: PersonaEvaluation[];
  /** 象限ごとのペルソナ数。 */
  quadrantCounts: Record<Quadrant, number>;
  /** 象限 I 過半による加点。 */
  majorityBonus: number;
  /** 象限 IV の上位ペルソナによる減点。 */
  topOpponentPenalty: number;
  /** 減点の対象になった重要ペルソナ。 */
  topOpponents: string[];
}

/** 凡庸性 (new-content)。 */
export interface BanalityResult {
  /** 0..1。 大きいほど凡庸。 */
  banality: number;
  /** total から引く点。 */
  penalty: number;
  /** 当たった既存パターン (類似度降順)。 */
  matches: Array<{ source: 'ludus' | 'discutere'; pattern: string; similarity: number }>;
  /** 類似度の測り方 (embedding が無い環境では語彙の重なり)。 */
  method: 'token-overlap';
  missing: Missing[];
}

/** デグレード危険度 (improvement)。 */
export interface DegradeRiskResult {
  /** 0..1。 DEFER_THRESHOLD 以上で verdict=defer。 */
  risk: number;
  breakdown: {
    /** 触るドメインの fan-in を 0..1 に写したもの。 */
    fanIn: number;
    /** hotspot 度 0..1。 */
    hotspot: number;
    /** 回帰テスト充足率 0..1 (1 = 充分)。 */
    regressionCoverage: number;
    /** 二層不整合 0..1 (1 = 完全に不整合)。 */
    layerMismatch: number;
  };
  /** Augur が要求した検査のうち回帰に効くもの。 */
  requiredChecks: string[];
  /** 先に返済すべき項目 (テスト追加 / refactoring proposal)。 */
  repayFirst: Array<{ kind: 'test' | 'refactoring'; label: string; detail?: string }>;
  missing: Missing[];
}

/** 総合の重み。 config で上書きできる。 */
export type AxisWeights = Record<AxisId, number>;

/** 評価 1 回分。 data/initiatives/<id>/evaluations/<ts>.json に積む。 */
export interface Evaluation {
  initiativeId: string;
  title: string;
  kind: InitiativeKind;
  project: string;
  evaluatedAt: string;
  axes: AxisResult[];
  discussion: DiscussionDetail | null;
  banality: BanalityResult | null;
  degrade: DegradeRiskResult | null;
  /** 0..100 (凡庸性ペナルティ差し引き後)。 */
  total: number;
  verdict: Verdict;
  /** Π confidence。 0.5 未満はビューアで「判定保留」。 */
  confidence: number;
  /** 減点理由 (人が読む)。 */
  reasons: string[];
  /** conditional のときの条件。 */
  conditions: string[];
  weights: AxisWeights;
}

/** 前回比 (GET /api/initiatives/:id で返す)。 */
export interface EvaluationDiff {
  previousAt: string | null;
  totalDelta: number | null;
  verdictChanged: boolean;
  axisDeltas: Array<{ axis: AxisId; delta: number }>;
}
