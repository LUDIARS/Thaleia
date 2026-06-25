// 突合の純粋ロジック — 上流取得には依存しない。 fixture でそのままテストできる。

import type {
  AnatomiaDomain,
  DomainMatch,
  PfDomain,
  PfSpec,
  ReconcileResult,
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
}

/**
 * ドメイン↔仕様書の突合。 純粋関数 (generatedAt は null のまま、 engine が打刻)。
 *
 * - ドメイン: Pf と Anatomia を正規化名で対応付け、 表記ゆれ/片側のみを分類。
 * - 仕様: その target ドメインが「実装あり (= 実装関数を持つ Anatomia ドメインに一致)」なら実装済。
 * - ギャップ: 実装の無い仕様 / 仕様の無い実装ドメイン を両方向で列挙。
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const { project, pfDomains, pfSpecs, anatomiaDomains } = input;

  // Anatomia ドメインを正規化名で索引 (実装関数を持つもの = コードが存在)。
  const anByNorm = new Map<string, AnatomiaDomain>();
  for (const d of anatomiaDomains) {
    const k = normalizeName(d.name);
    const prev = anByNorm.get(k);
    if (!prev || d.implementorCount > prev.implementorCount) anByNorm.set(k, d);
  }

  const domainMatches: DomainMatch[] = [];
  const matchedAnNorms = new Set<string>();
  /** Pf ドメイン名(正規化) → 実装あり? */
  const pfDomainImplemented = new Map<string, boolean>();

  for (const pf of pfDomains) {
    const norm = normalizeName(pf.name);
    const an = anByNorm.get(norm);
    if (an) {
      matchedAnNorms.add(norm);
      const implemented = an.implementorCount > 0;
      pfDomainImplemented.set(norm, implemented);
      domainMatches.push({
        pfDomain: pf.name,
        anatomiaDomain: an.name,
        status: pf.name === an.name ? 'matched' : 'name-mismatch',
      });
    } else {
      pfDomainImplemented.set(norm, false);
      domainMatches.push({ pfDomain: pf.name, anatomiaDomain: null, status: 'spec-only' });
    }
  }

  // Anatomia 側のみに存在する実装ドメイン (= 仕様欠落)。
  const codeDomainsWithoutSpec: string[] = [];
  for (const [norm, an] of anByNorm) {
    if (matchedAnNorms.has(norm)) continue;
    if (an.implementorCount <= 0) continue;
    domainMatches.push({ pfDomain: null, anatomiaDomain: an.name, status: 'code-only' });
    codeDomainsWithoutSpec.push(an.name);
  }

  // 仕様カバレッジ: target ドメインのいずれかが実装ありなら実装済。
  const specCoverage: SpecCoverage[] = [];
  const specsWithoutImpl: string[] = [];
  for (const spec of pfSpecs) {
    const implDomains = spec.targetDomains.filter((d) => pfDomainImplemented.get(normalizeName(d)));
    const implemented = implDomains.length > 0;
    specCoverage.push({
      specCode: spec.code,
      specTitle: spec.title,
      targetDomains: spec.targetDomains,
      implemented,
      evidence: implemented
        ? `実装ドメイン: ${implDomains.join(', ')}`
        : spec.targetDomains.length === 0
          ? 'target ドメイン未指定 (突合不能)'
          : `target ドメイン ${spec.targetDomains.join(', ')} に対応する実装が見つからない`,
    });
    if (!implemented) specsWithoutImpl.push(spec.code);
  }

  const matchedDomains = domainMatches.filter(
    (m) => m.status === 'matched' || m.status === 'name-mismatch',
  ).length;

  return {
    project,
    pfProjectId: input.pfProjectId ?? '',
    anatomiaProject: input.anatomiaProject ?? '',
    generatedAt: null,
    domainMatches,
    specCoverage,
    gaps: { specsWithoutImpl, codeDomainsWithoutSpec },
    summary: {
      pfDomains: pfDomains.length,
      anatomiaDomains: anByNorm.size,
      matchedDomains,
      specs: pfSpecs.length,
      implementedSpecs: specCoverage.filter((s) => s.implemented).length,
    },
  };
}
