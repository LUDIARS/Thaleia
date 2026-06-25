// 突合の純粋ロジック — 上流取得には依存しない。 fixture でそのままテストできる。

import type {
  AnatomiaDomain,
  AnatomiaScreen,
  DomainMatch,
  PfDomain,
  PfLayout,
  PfSpec,
  ReconcileResult,
  SceneMatch,
  SpecCoverage,
} from './types.ts';

/** 名寄せ用の正規化: 小文字 + NFKC + 記号/空白除去。 "Player Move" ↔ "player-move" を一致させる。 */
export function normalizeName(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[\s_\-./]+/g, '');
}

export interface ReconcileInput {
  project: string;
  /** Praeforma project id (ディープリンク用。 純粋テストでは省略可)。 */
  pfProjectId?: string;
  /** Anatomia project id (ディープリンク用。 純粋テストでは省略可)。 */
  anatomiaProject?: string;
  pfDomains: PfDomain[];
  pfSpecs: PfSpec[];
  anatomiaDomains: AnatomiaDomain[];
  /** Praeforma のシーン(layout)。 省略時は scene 突合をスキップ。 */
  pfLayouts?: PfLayout[];
  /** Anatomia の検出スクリーン。 省略時は scene 突合をスキップ。 */
  anatomiaScreens?: AnatomiaScreen[];
}

/** 汎用の名前突合 1 行 (domain/scene 共通)。 */
interface NameMatch {
  pf: string | null;
  an: string | null;
  status: 'matched' | 'name-mismatch' | 'spec-only' | 'code-only';
}

interface AnItem {
  name: string;
  /** 実装の有無/規模 (>0 = コードが存在)。 スクリーンは存在 = 1。 */
  implementorCount: number;
}

interface BipartiteResult {
  matches: NameMatch[];
  /** Pf 名(正規化) → 実装あり? */
  implementedByNorm: Map<string, boolean>;
  /** 仕様の無い実装側 (code-only) の名前一覧。 */
  codeOnly: string[];
  /** 正規化後の Anatomia 側ユニーク数。 */
  anCount: number;
}

/**
 * Pf 側の名前群と Anatomia 側の実装群を正規化名で突き合わせる (domain/scene 共通の純粋関数)。
 * matched / name-mismatch(表記ゆれ) / spec-only(実装欠落) / code-only(仕様欠落) に分類。
 */
function bipartiteMatch(pfNames: string[], anItems: AnItem[]): BipartiteResult {
  const anByNorm = new Map<string, AnItem>();
  for (const a of anItems) {
    const k = normalizeName(a.name);
    const prev = anByNorm.get(k);
    if (!prev || a.implementorCount > prev.implementorCount) anByNorm.set(k, a);
  }

  const matches: NameMatch[] = [];
  const matchedNorms = new Set<string>();
  const implementedByNorm = new Map<string, boolean>();

  for (const name of pfNames) {
    const norm = normalizeName(name);
    const an = anByNorm.get(norm);
    if (an) {
      matchedNorms.add(norm);
      implementedByNorm.set(norm, an.implementorCount > 0);
      matches.push({ pf: name, an: an.name, status: name === an.name ? 'matched' : 'name-mismatch' });
    } else {
      implementedByNorm.set(norm, false);
      matches.push({ pf: name, an: null, status: 'spec-only' });
    }
  }

  const codeOnly: string[] = [];
  for (const [norm, an] of anByNorm) {
    if (matchedNorms.has(norm)) continue;
    if (an.implementorCount <= 0) continue;
    matches.push({ pf: null, an: an.name, status: 'code-only' });
    codeOnly.push(an.name);
  }

  return { matches, implementedByNorm, codeOnly, anCount: anByNorm.size };
}

/**
 * ドメイン/シーン↔仕様書の突合。 純粋関数 (generatedAt は null のまま、 engine が打刻)。
 *
 * - ドメイン/シーン: Pf と Anatomia を正規化名で対応付け、 表記ゆれ/片側のみを分類。
 * - 仕様: target ドメイン/シーンのいずれかが「実装あり」なら実装済。
 * - ギャップ: 実装の無い仕様 / 仕様の無い実装ドメイン・スクリーン を列挙。
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const { project, pfDomains, pfSpecs, anatomiaDomains } = input;
  const pfLayouts = input.pfLayouts ?? [];
  const anatomiaScreens = input.anatomiaScreens ?? [];

  // ── ドメイン突合 ──
  const dom = bipartiteMatch(
    pfDomains.map((d) => d.name),
    anatomiaDomains,
  );
  const domainMatches: DomainMatch[] = dom.matches.map((m) => ({
    pfDomain: m.pf,
    anatomiaDomain: m.an,
    status: m.status,
  }));

  // ── シーン(layout)突合 (スクリーンは存在 = implementorCount 1) ──
  const scn = bipartiteMatch(
    pfLayouts.map((l) => l.name),
    anatomiaScreens.map((s) => ({ name: s.name, implementorCount: 1 })),
  );
  const sceneMatches: SceneMatch[] = scn.matches.map((m) => ({
    pfScene: m.pf,
    anatomiaScreen: m.an,
    status: m.status,
  }));

  // ── 仕様カバレッジ: target ドメイン or シーンのいずれかが実装ありなら実装済 ──
  const specCoverage: SpecCoverage[] = [];
  const specsWithoutImpl: string[] = [];
  for (const spec of pfSpecs) {
    const targetScenes = spec.targetScenes ?? [];
    const implDomains = spec.targetDomains.filter((d) => dom.implementedByNorm.get(normalizeName(d)));
    const implScenes = targetScenes.filter((s) => scn.implementedByNorm.get(normalizeName(s)));
    const implemented = implDomains.length > 0 || implScenes.length > 0;
    const hasTarget = spec.targetDomains.length > 0 || targetScenes.length > 0;
    specCoverage.push({
      specCode: spec.code,
      specTitle: spec.title,
      targetDomains: spec.targetDomains,
      targetScenes,
      implemented,
      evidence: implemented
        ? `実装: ${[...implDomains.map((d) => `domain:${d}`), ...implScenes.map((s) => `scene:${s}`)].join(', ')}`
        : !hasTarget
          ? 'target 未指定 (突合不能)'
          : `target ${[...spec.targetDomains, ...targetScenes].join(', ')} に対応する実装が見つからない`,
    });
    if (!implemented) specsWithoutImpl.push(spec.code);
  }

  const matchedDomains = domainMatches.filter(
    (m) => m.status === 'matched' || m.status === 'name-mismatch',
  ).length;
  const matchedScenes = sceneMatches.filter(
    (m) => m.status === 'matched' || m.status === 'name-mismatch',
  ).length;

  return {
    project,
    pfProjectId: input.pfProjectId ?? '',
    anatomiaProject: input.anatomiaProject ?? '',
    generatedAt: null,
    domainMatches,
    sceneMatches,
    specCoverage,
    gaps: {
      specsWithoutImpl,
      codeDomainsWithoutSpec: dom.codeOnly,
      codeScreensWithoutSpec: scn.codeOnly,
    },
    summary: {
      pfDomains: pfDomains.length,
      anatomiaDomains: dom.anCount,
      matchedDomains,
      pfScenes: pfLayouts.length,
      anatomiaScreens: scn.anCount,
      matchedScenes,
      specs: pfSpecs.length,
      implementedSpecs: specCoverage.filter((s) => s.implemented).length,
    },
  };
}
