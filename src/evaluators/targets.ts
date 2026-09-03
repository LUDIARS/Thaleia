// 「この施策が触るドメイン」の解決。 実装コスト軸とドメイン解析軸が共有する I/O。
//
// 企画本文は自然文なので、 候補抽出は LLM に任せ、 Anatomia の検出ドメインへの名寄せは
// 決定的に (text/normalize の normalizeName で) 行う。 名寄せできなかった候補は
// 「新規ドメインが要る」とみなす (設計 §4.2)。

import { extractJson } from '../llm/claude.ts';
import { normalizeName } from '../text/normalize.ts';
import type { AnatomiaDomain } from '../clients/anatomia-types.ts';
import type { Initiative, Missing } from '../initiative/types.ts';
import type { ClaudeRunner } from '../llm/claude.ts';
import { missingFrom } from './axis.ts';

/** 触るドメイン 1 件。 */
export interface DomainTarget {
  /** LLM が挙げた候補名 (原文)。 */
  raw: string;
  /** Anatomia の検出ドメイン名。 名寄せできなければ null (= 新規)。 */
  matched: string | null;
}

export interface DomainTargetResolution {
  targets: DomainTarget[];
  missing: Missing[];
}

const MAX_TARGETS = 8;

/** 企画本文から触るドメイン候補を挙げ、 Anatomia の検出ドメインへ名寄せする。 */
export async function resolveDomainTargets(
  llm: ClaudeRunner,
  initiative: Initiative,
  anatomiaDomains: readonly AnatomiaDomain[],
): Promise<DomainTargetResolution> {
  const missing: Missing[] = [];
  let candidates: string[] = [];
  try {
    candidates = await extractCandidates(llm, initiative, anatomiaDomains);
  } catch (e) {
    missing.push(missingFrom('llm_domain_extraction_failed', e));
    return { targets: [], missing };
  }

  const byNormalized = new Map(anatomiaDomains.map((d) => [normalizeName(d.name), d.name]));
  const seen = new Set<string>();
  const targets: DomainTarget[] = [];
  for (const candidate of candidates.slice(0, MAX_TARGETS)) {
    const key = normalizeName(candidate);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    targets.push({ raw: candidate, matched: byNormalized.get(key) ?? null });
  }
  return { targets, missing };
}

async function extractCandidates(
  llm: ClaudeRunner,
  initiative: Initiative,
  anatomiaDomains: readonly AnatomiaDomain[],
): Promise<string[]> {
  const known = anatomiaDomains.map((d) => d.name).slice(0, 200);
  const prompt = [
    'あなたはコードベースのドメイン分割を読むアシスタントです。',
    '次の企画を実装するときに触るドメイン名を挙げてください。',
    '既知のドメイン名に該当するものはその名前をそのまま使い、',
    '該当が無い場合だけ新しい名前を書いてください。',
    '',
    `# 既知のドメイン (${known.length} 件)`,
    known.length > 0 ? known.join(', ') : '(未取得)',
    '',
    '# 企画',
    `タイトル: ${initiative.title}`,
    `種別: ${initiative.kind}`,
    initiative.body.slice(0, 20_000),
    '',
    '# 出力',
    'JSON のみ。 説明文は書かないでください。',
    '{"domains": ["...", "..."]}',
  ].join('\n');

  const out = await llm(prompt);
  const parsed = extractJson<{ domains?: unknown }>(out);
  if (!Array.isArray(parsed.domains)) return [];
  return parsed.domains.map((d) => String(d).trim()).filter((d) => d !== '');
}
