// relay の LLM 意味ランキング (任意・opt-in)。
//
// 構造選択 (select.ts) が出した候補ノードは「ドメイン実装 + 検索語の字面一致」なので、
// 要件 (requirements) との意味的な近さは見ていない。 ここで claude -p に候補を渡し、
// 要件/検索意図に最も関連する上位 K 件へ絞り込み + 並べ替える。
//
// 無言 fallback 禁止: 呼ぶ (opt-in 有効) と決めたら成否を返す。 claude 不在/失敗は
// LlmError を投げ、 route が 5xx に写す (構造結果へ黙って戻さない)。
// ただし「候補が空」「LLM が 1 件も選ばなかった」は事実なので、 そのまま空/絞り込みを返す。

import type { RelayResult, RelayRequirement, RelayTarget } from './types.ts';
import { extractJson, type ClaudeRunner } from '../llm/claude.ts';

export interface RankContext {
  target: RelayTarget;
  requirements: RelayRequirement[];
  query?: string;
  /** 残す上限件数。 */
  topK: number;
}

/** プロンプトに載せるノード行。 LLM が key で選び返す。 */
function nodeLine(n: RelayResult['nodes'][number]): string {
  return `- ${n.key}: ${n.label} [${n.type}] ${n.anatomia_ref.path}`;
}

/** 要件 1 件を短い 1 行に。 */
function reqLine(r: RelayRequirement): string {
  const head = [r.code, r.title].filter(Boolean).join(' ');
  const acc = r.acceptance?.length ? ` / 受入: ${r.acceptance.join('; ')}` : '';
  return `- ${head}${r.description ? `: ${r.description}` : ''}${acc}`;
}

/** ランキング用プロンプトを組む (出力は keys 配列の JSON のみ)。 */
export function buildRankPrompt(nodes: RelayResult['nodes'], ctx: RankContext): string {
  const kindJa = ctx.target.kind === 'domain' ? 'ドメイン' : 'シーン';
  return [
    'あなたはコードベースの関連処理を選別するアシスタントです。',
    `対象${kindJa }「${ctx.target.name ?? '(無名)'}」の要件実装に関連する処理を、 候補から選んでください。`,
    ctx.target.description ? `対象の概要: ${ctx.target.description}` : '',
    ctx.query ? `検索意図: ${ctx.query}` : '',
    '',
    ctx.requirements.length ? '要件:' : '要件: (なし — 検索意図と対象名で判断)',
    ...ctx.requirements.map(reqLine),
    '',
    `候補ノード (key: ラベル [種別] パス):`,
    ...nodes.map(nodeLine),
    '',
    `上記候補のうち、 対象の要件実装に関連が高い順に最大 ${ctx.topK} 件の key を選んでください。`,
    '候補に無い key を創作しないこと。 関連が無ければ少数でも構いません。',
    '出力は次の JSON のみ (説明文・前置きなし):',
    '{"keys":["<node key>", "..."]}',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 構造候補 (RelayResult) を LLM で意味ランキングし、 上位 K 件へ絞った RelayResult を返す。
 * 候補が空ならそのまま返す (LLM を呼ばない)。 エッジは残ったノード間のみ。
 */
export async function rankRelayResult(
  result: RelayResult,
  ctx: RankContext,
  run: ClaudeRunner,
): Promise<RelayResult> {
  if (result.nodes.length === 0) return result;

  const prompt = buildRankPrompt(result.nodes, ctx);
  const raw = await run(prompt);
  const parsed = extractJson<{ keys?: unknown }>(raw);
  const candidateKeys = new Set(result.nodes.map((n) => n.key));

  // LLM 返却の keys を候補内・重複排除・順序保持で確定 (創作 key は捨てる)。
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const k of Array.isArray(parsed.keys) ? parsed.keys : []) {
    if (typeof k !== 'string') continue;
    if (!candidateKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    ordered.push(k);
    if (ordered.length >= ctx.topK) break;
  }

  const keptIds = new Set(ordered);
  const byKey = new Map(result.nodes.map((n) => [n.key, n]));
  const nodes = ordered.map((k) => byKey.get(k)!);
  const edges = result.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));

  const summary = `${result.summary} / LLM ランキングで ${result.nodes.length}→${nodes.length} 件に絞り込み`;
  return { nodes, edges, summary };
}
