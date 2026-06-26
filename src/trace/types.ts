// 関数粒度トレース (spec-links) のドメインモデル。
//
// 「ドメイン X は実装あり」を関数粒度へ掘り下げる: 対象ドメインの実装関数群を列挙し、
// 各関数に Anatomia の spec-links (コード↔リポ spec 節リンク) を結びつける。
// Anatomia の spec-links は関数 anchor 単位のことも、 ファイル単位のこともある (実測では
// adventurecube は全ファイル単位)。 join は from===関数id OR from===関数ファイルパス の両対応。

/** Anatomia spec-links の 1 行 (コード anchor → リポ spec 節)。 */
export interface AnatomiaSpecLink {
  /** anchor id (関数ハッシュ) もしくはファイルの絶対パス。 */
  from: string;
  fromName: string;
  /** spec 節の見出し。 */
  clauseHeading: string;
  /** spec 節が載るファイル。 */
  clauseFile: string;
  /** 0..1。 */
  confidence: number;
  ratified: boolean;
}

/** トレースの 1 関数 (実装関数 + それに結びつく spec 節リンク)。 */
export interface TraceFunction {
  /** 関数 anchor id。 */
  id: string;
  name: string;
  /** 宣言ファイルの絶対パス。 */
  path: string;
  /** この関数 (またはその所属ファイル) に結びつく spec 節リンク (confidence 降順)。 */
  specLinks: Array<{ clauseHeading: string; clauseFile: string; confidence: number; ratified: boolean }>;
}

/** ドメイン 1 件の関数粒度トレース結果。 */
export interface TraceResult {
  domain: string;
  /** 対象ドメインが Anatomia の検出ドメインに在ったか (false なら functions 空)。 */
  matched: boolean;
  functions: TraceFunction[];
  summary: {
    /** 返した関数数。 */
    functionCount: number;
    /** spec 節リンクを 1 つ以上持つ関数数。 */
    linkedFunctions: number;
    /** 上限で切り詰めたか。 */
    truncated: boolean;
    /** 切り詰め前の実装関数総数。 */
    totalImplementors: number;
  };
}

/**
 * Pf spec 1 件の関数粒度トレース結果。
 *
 * 「要件 (spec) → その target ドメイン群 → 各ドメインを実装する関数 → spec-links」を
 * 直結する。 要件↔関数のトレーサビリティ (ドメイン単位の TraceResult を spec 起点に束ねたもの)。
 */
export interface SpecTraceResult {
  /** Pf spec の code。 */
  specCode: string;
  /** Pf spec の title。 */
  specTitle: string;
  /** spec が target に指定したドメイン名 (Pf 側で id→name 解決済)。 */
  targetDomains: string[];
  /** target ドメインごとの関数トレース (domain 単位 TraceResult をそのまま束ねる)。 */
  domains: TraceResult[];
  summary: {
    /** target ドメイン数。 */
    domainCount: number;
    /** Anatomia の検出ドメインに在った (実装が見つかった) target 数。 */
    matchedDomains: number;
    /** 全 target を通じた関数数の合計 (重複ドメインが無い前提)。 */
    functionCount: number;
    /** spec 節リンクを 1 つ以上持つ関数数の合計。 */
    linkedFunctions: number;
  };
}
