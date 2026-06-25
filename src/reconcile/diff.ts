// 突合スナップショットの前回比 — 純粋関数。 進捗 (実装が進んだ/退行した) を抽出する。
//
// トレーサビリティツールの価値は「いま」だけでなく「前回からどう変わったか」。 ここは
// 2 つの ReconcileResult を受け取り、 ドメイン/シーンの出入り・状態変化、 仕様の前進/退行、
// summary の増減を出す。 上流 I/O を持たない (store が前回を渡す)。

import type {
  DomainMatch,
  MatchDelta,
  ReconcileDiff,
  ReconcileResult,
  SceneMatch,
  SpecCoverage,
  StatusChange,
} from './types.ts';

/** ドメイン行のキー = Pf 名 (無ければ Anatomia 名)。 */
function domainKey(m: DomainMatch): string {
  return m.pfDomain ?? m.anatomiaDomain ?? '';
}

/** シーン行のキー = Pf 名 (無ければ Anatomia 名)。 */
function sceneKey(m: SceneMatch): string {
  return m.pfScene ?? m.anatomiaScreen ?? '';
}

/** 名前→status のマップを作り、 出入り + status 変化を出す汎用 delta。 */
function matchDelta(
  prev: Array<{ key: string; status: string }>,
  curr: Array<{ key: string; status: string }>,
): MatchDelta {
  const prevByKey = new Map(prev.map((r) => [r.key, r.status]));
  const currByKey = new Map(curr.map((r) => [r.key, r.status]));

  const added: string[] = [];
  const statusChanged: StatusChange[] = [];
  for (const [key, status] of currByKey) {
    if (!prevByKey.has(key)) {
      added.push(key);
    } else if (prevByKey.get(key) !== status) {
      statusChanged.push({ name: key, from: prevByKey.get(key)!, to: status });
    }
  }
  const removed: string[] = [];
  for (const key of prevByKey.keys()) {
    if (!currByKey.has(key)) removed.push(key);
  }
  return { added, removed, statusChanged };
}

/** spec の実装状況マップ (code→implemented)。 */
function specMap(cov: SpecCoverage[]): Map<string, boolean> {
  return new Map(cov.map((s) => [s.specCode, s.implemented]));
}

/** summary の増減 (0 のキーは含めない)。 */
function summaryDelta(
  prev: ReconcileResult['summary'],
  curr: ReconcileResult['summary'],
): ReconcileDiff['summaryDelta'] {
  const out: ReconcileDiff['summaryDelta'] = {};
  for (const k of Object.keys(curr) as Array<keyof ReconcileResult['summary']>) {
    const d = curr[k] - (prev[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}

const EMPTY_DELTA: MatchDelta = { added: [], removed: [], statusChanged: [] };

/**
 * curr を prev と比較した差分を返す。 prev が null なら初回 (hasPrevious=false、 全空)。
 * 「いま全部新規」ではなく空にするのは、 初回に「全部 added」と出すとノイズになるため
 * (初回は突合そのものを見ればよい)。
 */
export function diffReconcile(prev: ReconcileResult | null, curr: ReconcileResult): ReconcileDiff {
  if (!prev) {
    return {
      hasPrevious: false,
      previousAt: null,
      domains: EMPTY_DELTA,
      scenes: EMPTY_DELTA,
      specs: { nowImplemented: [], regressed: [], added: [], removed: [] },
      summaryDelta: {},
    };
  }

  const domains = matchDelta(
    prev.domainMatches.map((m) => ({ key: domainKey(m), status: m.status })),
    curr.domainMatches.map((m) => ({ key: domainKey(m), status: m.status })),
  );
  const scenes = matchDelta(
    (prev.sceneMatches ?? []).map((m) => ({ key: sceneKey(m), status: m.status })),
    (curr.sceneMatches ?? []).map((m) => ({ key: sceneKey(m), status: m.status })),
  );

  const prevSpec = specMap(prev.specCoverage);
  const currSpec = specMap(curr.specCoverage);
  const nowImplemented: string[] = [];
  const regressed: string[] = [];
  const added: string[] = [];
  for (const [code, impl] of currSpec) {
    if (!prevSpec.has(code)) {
      added.push(code);
    } else {
      const was = prevSpec.get(code)!;
      if (!was && impl) nowImplemented.push(code);
      if (was && !impl) regressed.push(code);
    }
  }
  const removed: string[] = [];
  for (const code of prevSpec.keys()) {
    if (!currSpec.has(code)) removed.push(code);
  }

  return {
    hasPrevious: true,
    previousAt: prev.generatedAt,
    domains,
    scenes,
    specs: { nowImplemented, regressed, added, removed },
    summaryDelta: summaryDelta(prev.summary, curr.summary),
  };
}
