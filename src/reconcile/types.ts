// 突合 (reconcile) のドメインモデル。
//
// Thaleia は Praeforma(人間の仕様概念) と Anatomia(コード解析) を中立モデルに正規化してから
// 突合する。 ここはどの上流にも依存しない純粋な型定義。

/** Praeforma 側のドメイン (人間が定義した役割/領域)。 */
export interface PfDomain {
  id: string;
  name: string;
  description?: string | null;
}

/** Praeforma 側のシーン (= layout。 spec §4 で layout = scene)。 */
export interface PfLayout {
  id: string;
  name: string;
  description?: string | null;
}

/** Praeforma 側の仕様書 1 件。 targetDomains/targetScenes = 紐付くドメイン名/シーン名 (解決済)。 */
export interface PfSpec {
  id: string;
  code: string;
  title: string;
  status?: string;
  priority?: string;
  targetDomains: string[];
  /** target kind==='layout' を解決したシーン名 (省略時は []) 。 */
  targetScenes?: string[];
}

/** Anatomia 側の検出ドメイン (実装が存在するもの)。 */
export interface AnatomiaDomain {
  name: string;
  /** 実装関数の数 (>0 = コードが存在)。 不明な場合も「存在」を表す 1 以上。 */
  implementorCount: number;
}

/** Anatomia 側の検出スクリーン/シーン (実装が存在する UI 画面)。 */
export interface AnatomiaScreen {
  name: string;
}

/** ドメイン突合 1 行。 仕様(人間) ↔ 実装(機械) の対応とギャップ。 */
export interface DomainMatch {
  /** Praeforma のドメイン名 (なければ code-only)。 */
  pfDomain: string | null;
  /** Anatomia の検出ドメイン名 (なければ spec-only)。 */
  anatomiaDomain: string | null;
  /**
   * matched: 名前そのまま一致 /
   * name-mismatch: 正規化後一致だが原文が違う (表記ゆれ) /
   * spec-only: Praeforma にのみ存在 (= 実装欠落) /
   * code-only: Anatomia にのみ存在 (= 仕様欠落)
   */
  status: 'matched' | 'name-mismatch' | 'spec-only' | 'code-only';
}

/** シーン突合 1 行。 仕様(人間の layout) ↔ 実装(Anatomia 検出スクリーン) の対応とギャップ。 */
export interface SceneMatch {
  /** Praeforma のシーン(layout)名 (なければ code-only)。 */
  pfScene: string | null;
  /** Anatomia の検出スクリーン名 (なければ spec-only)。 */
  anatomiaScreen: string | null;
  /** domain と同じ 4 状態 (matched / name-mismatch / spec-only / code-only)。 */
  status: 'matched' | 'name-mismatch' | 'spec-only' | 'code-only';
}

/** 仕様書のカバレッジ (実装されているか)。 */
export interface SpecCoverage {
  specCode: string;
  specTitle: string;
  targetDomains: string[];
  /** target kind==='layout' のシーン名 (省略時は []) 。 */
  targetScenes: string[];
  implemented: boolean;
  /** 判定根拠 (どのドメイン/シーンの実装で満たされたか等)。 */
  evidence: string;
}

/** 突合結果。 */
export interface ReconcileResult {
  project: string;
  /** Praeforma の project id (ディープリンク生成に使う。 純粋層では空文字)。 */
  pfProjectId: string;
  /** Anatomia の project id (ディープリンク生成に使う。 純粋層では空文字)。 */
  anatomiaProject: string;
  /** ISO 文字列。 純粋層では null、 engine が打刻する。 */
  generatedAt: string | null;
  domainMatches: DomainMatch[];
  sceneMatches: SceneMatch[];
  specCoverage: SpecCoverage[];
  gaps: {
    /** 実装が見つからない仕様 (code 一覧)。 */
    specsWithoutImpl: string[];
    /** 仕様の無い実装ドメイン (name 一覧)。 */
    codeDomainsWithoutSpec: string[];
    /** 仕様の無い実装スクリーン (name 一覧)。 */
    codeScreensWithoutSpec: string[];
  };
  summary: {
    pfDomains: number;
    anatomiaDomains: number;
    matchedDomains: number;
    pfScenes: number;
    anatomiaScreens: number;
    matchedScenes: number;
    specs: number;
    implementedSpecs: number;
  };
}
