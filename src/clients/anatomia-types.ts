// Anatomia (コード解析) から受け取る値の中立モデル。
//
// Anatomia の web server (`anatomia web --port 4200`) は loopback 無認証。 応答は解析結果の
// 生 payload なので、 ここで Thaleia が使う分だけを取り出した型に落とす (上流の内部型に依存しない)。
// 取得側の正規化は clients/anatomia.ts。 ここは純粋な型定義。

/** 検出ドメイン (実装が存在するもの)。 */
export interface AnatomiaDomain {
  name: string;
  /** 実装関数の数 (>0 = コードが存在)。 一覧 API 経由で数が不明な場合も「存在」を表す 1 以上。 */
  implementorCount: number;
  /** ドメイン規約に適合しているか (不明なら null)。 */
  conforms?: boolean | null;
  /** 規約違反の件数 (不明なら null)。 */
  violationCount?: number | null;
}

/** 検出スクリーン/シーン (実装が存在する UI 画面)。 */
export interface AnatomiaScreen {
  name: string;
}

/** シーン (scene 知識ビューの 1 件)。 */
export interface AnatomiaScene {
  id: string;
  name: string;
}

/** コードグラフの 1 ノード。 */
export interface AnatomiaGraphNode {
  /** AnchorId (文字列)。 */
  id: string;
  name: string;
  /** function | method | class | module | file。 */
  kind: string;
  /** 宣言ファイルの絶対パス。 */
  path: string;
}

/** コードグラフの 1 エッジ。 */
export interface AnatomiaGraphEdge {
  from: string;
  to: string;
  /** calls | depends | reads | writes | implements | overrides | includes。 */
  kind: string;
}

export interface AnatomiaGraph {
  nodes: AnatomiaGraphNode[];
  edges: AnatomiaGraphEdge[];
}

/** モジュール 1 件 (`/modules` の評価結果から Thaleia が使う分)。 */
export interface AnatomiaModule {
  id: string;
  /** 所属レイヤ (不明なら null)。 */
  layer: string | null;
  /** モジュール内の記号数 (不明なら 0)。 */
  symbolCount: number;
}

/** ホットスポット 1 件 (結合度 + 複雑度の上位関数)。 */
export interface AnatomiaHotspot {
  /** AnchorId もしくは関数名 (上流が返した識別子)。 */
  id: string;
  name: string;
  /** 宣言ファイル (不明なら '')。 */
  path: string;
  /** 上流のスコア。 大きいほど危険。 */
  score: number;
}

/** entrypoint-graph の 1 ノード (入口からの到達関数)。 */
export interface AnatomiaEntrypointNode {
  id: string;
  name: string;
  path: string;
  /** この関数へ到達する入口 id。 */
  reachedFrom: string[];
}

/** 入口からの到達グラフ。 fan-in は edges の to 側集計で出す。 */
export interface AnatomiaEntrypointGraph {
  entries: Array<{ id: string; name: string }>;
  nodes: AnatomiaEntrypointNode[];
  edges: Array<{ from: string; to: string }>;
}

/** 業務ドメインビューの 1 ドメイン。 二層整合の業務側。 */
export interface AnatomiaBusinessDomain {
  id: string;
  name: string;
  status: 'implemented' | 'spec-only' | 'missing' | string;
  /** 紐づくプログラムドメイン (weight 付き)。 空 = 実装側に着地点が無い。 */
  programDomains: Array<{ programDomainId: string; weight: number }>;
  /** 仕様節への参照数の素材。 */
  specRefCount: number;
}

/** プログラムドメインビューの 1 ドメイン。 二層整合の実装側。 */
export interface AnatomiaProgramDomain {
  id: string;
  layer: string;
  moduleCount: number;
  codeSymbolCount: number;
  /** レイヤ規約に合わない記号数。 */
  misfitCount: number;
  /** 紐づく業務ドメイン (weight 付き)。 空 = 業務側に持ち主が居ない。 */
  businessDomains: Array<{ businessDomainId: string; weight: number }>;
}

/** リファクタリング提案 (program-domain-view の active findings)。 */
export interface AnatomiaRefactoringProposal {
  proposalId: string;
  rule: string;
  action: string;
  /** 対象のプログラムドメイン / モジュール id (上流の targets から解決した表示名)。 */
  targets: string[];
  /** 発行済み調整タスクがあれば その状態。 */
  taskStatus: 'open' | 'done' | null;
}

/** プログラムドメインビュー全体 (二層整合と返済リストの素材)。 */
export interface AnatomiaProgramDomainView {
  domains: AnatomiaProgramDomain[];
  proposals: AnatomiaRefactoringProposal[];
  /** 全体のモジュール性 (0..1)。 */
  modularity: number;
}
