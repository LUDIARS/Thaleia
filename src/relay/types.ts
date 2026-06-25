// MUSA リレー (Praeforma → Thaleia → Anatomia) のドメインモデル。
//
// Praeforma の要件定義モード (studio) が `POST /relay/anatomia` で呼ぶ暫定 wire 契約。
// Thaleia は Anatomia のコードグラフを取得し、 Praeforma の code-graph スキーマが
// そのまま飲める形 (key/label/type/anatomia_ref, from/to/relation) に正規化して返す。
// ここはどの上流にも依存しない純粋な型定義。

/** リレー対象。 kind=domain は検出ドメイン、 layout は scene (v1 は query 照合のみ)。 */
export interface RelayTarget {
  kind: 'domain' | 'layout';
  id?: string;
  name?: string;
  description?: string | null;
}

/** Praeforma 側の要件 1 件 (将来の意味ランキング用に受けるが v1 は未使用)。 */
export interface RelayRequirement {
  code?: string;
  title?: string;
  description?: string | null;
  priority?: string;
  category?: string;
  acceptance?: string[];
}

/** Praeforma → Thaleia リレー要求 (musa-relay.ts MusaAnatomiaRequest と同形)。 */
export interface RelayRequest {
  /** Anatomia の project id (= 解析登録名)。 */
  project: string;
  target: RelayTarget;
  requirements?: RelayRequirement[];
  /** 関連処理の検索文 (任意)。 */
  query?: string;
  /** 解析対象リポ (任意。 Anatomia 側で project を解決できるなら不要)。 */
  repo?: string;
}

/** Praeforma code-graph の GraphNodeType に合わせた node 種別。 */
export type RelayNodeType = 'symbol' | 'file';

/** Praeforma code-graph の GraphRelation に合わせた edge 関係。 */
export type RelayRelation = 'calls' | 'depends' | 'implements' | 'related';

/** リレー結果のノード (Praeforma MusaAnatomiaNode と同形)。 */
export interface RelayNode {
  /** Anatomia の AnchorId。 edges の from/to が参照する一意キー。 */
  key: string;
  label: string;
  type: RelayNodeType;
  anatomia_ref: { path: string; symbol?: string; kind?: string };
}

/** リレー結果のエッジ (Praeforma MusaAnatomiaEdge と同形)。 */
export interface RelayEdge {
  from: string;
  to: string;
  relation: RelayRelation;
}

/** リレー結果。 */
export interface RelayResult {
  nodes: RelayNode[];
  edges: RelayEdge[];
  summary: string;
}

// ── Anatomia 生グラフ (clients/anatomia.ts が GET /api/graph から正規化して渡す) ──

/** Anatomia コードグラフの 1 ノード。 */
export interface AnatomiaGraphNode {
  /** AnchorId (文字列)。 */
  id: string;
  name: string;
  /** function | method | class | module | file。 */
  kind: string;
  /** 宣言ファイルの絶対パス。 */
  path: string;
}

/** Anatomia コードグラフの 1 エッジ。 */
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
