// 意味照合 (opt-in) — 字面正規化で対応しなかったドメイン/シーンを LLM で意味的に対応付ける。
//
// 名寄せ (normalizeName) は表記ゆれ (Player↔player) しか吸えない。 概念が同じだが語が違う
// (戦闘↔combat、 持ち物↔inventory) は spec-only / code-only に分かれてしまう。 ここで
// claude -p に未対応の両側を渡し「同じ概念のペア」を貰って alias にする (= 真の embedding は
// no-API 規約下で持てないため、 LLM 判定で意味照合を代替する)。
//
// 無言 fallback 禁止: 呼ぶ (opt-in 有効) と決めたら成否を返す。 失敗は LlmError を投げ、
// route が 5xx に写す (構造突合へ黙って戻さない)。 ただし「対応ペア無し」は事実なので空を返す。

import { extractJson, type ClaudeRunner } from '../llm/claude.ts';

/** 意味照合で同じ概念と判定された 1 ペア。 */
export interface SemanticPair {
  /** Praeforma 側 (未実装だった) 名。 */
  pf: string;
  /** Anatomia 側 (仕様欠落だった) 名。 */
  an: string;
  /** 0..1。 */
  confidence: number;
}

/** confidence の下限 (これ未満は採用しない)。 */
export const SEMANTIC_MIN_CONFIDENCE = 0.5;

/** 意味照合プロンプトを組む (出力は pairs の JSON のみ)。 */
export function buildSemanticPrompt(pfNames: string[], anNames: string[], kindJa: string): string {
  return [
    `あなたは${kindJa}概念の対応付けアシスタントです。`,
    `仕様側(Praeforma)の未対応${kindJa}と、 実装側(Anatomia)の未対応${kindJa}のうち、`,
    '「同じ概念を指す」ペアを見つけてください。 表記ゆれは既に正規化済みなので、 ここでは',
    '意味的に同じものだけを対応付けます (例: 戦闘↔combat、 持ち物↔inventory)。',
    '',
    `仕様側: ${JSON.stringify(pfNames)}`,
    `実装側: ${JSON.stringify(anNames)}`,
    '',
    '出力は次の JSON のみ (説明文・前置きなし):',
    '{"pairs":[{"pf":"<仕様側の名前>","an":"<実装側の名前>","confidence":0.0}]}',
    '確信が持てないペアは出さないこと。 各名前は最大 1 回。 無ければ {"pairs":[]}。',
  ].join('\n');
}

/** LLM 返却から、 入力名に実在し confidence 下限以上のペアを 1:1 で確定する。 */
export function parseSemanticPairs(
  raw: string,
  pfNames: string[],
  anNames: string[],
): SemanticPair[] {
  const parsed = extractJson<{ pairs?: unknown }>(raw);
  const pfSet = new Set(pfNames);
  const anSet = new Set(anNames);
  const usedPf = new Set<string>();
  const usedAn = new Set<string>();
  const out: SemanticPair[] = [];

  const list = Array.isArray(parsed.pairs) ? parsed.pairs : [];
  // confidence 降順で貪欲に 1:1 確定 (高信頼を優先)。
  const cands: SemanticPair[] = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const pf = (p as { pf?: unknown }).pf;
    const an = (p as { an?: unknown }).an;
    const conf = (p as { confidence?: unknown }).confidence;
    if (typeof pf !== 'string' || typeof an !== 'string') continue;
    if (!pfSet.has(pf) || !anSet.has(an)) continue; // 創作名は捨てる
    const confidence = typeof conf === 'number' ? conf : 0;
    if (confidence < SEMANTIC_MIN_CONFIDENCE) continue;
    cands.push({ pf, an, confidence });
  }
  cands.sort((a, b) => b.confidence - a.confidence);
  for (const c of cands) {
    if (usedPf.has(c.pf) || usedAn.has(c.an)) continue;
    usedPf.add(c.pf);
    usedAn.add(c.an);
    out.push(c);
  }
  return out;
}

/**
 * 未対応の Pf 名 / An 名を LLM で意味照合し、 同概念ペアを返す。
 * どちらかが空なら LLM を呼ばず空 (照合相手がいない)。
 */
export async function semanticMatch(
  pfNames: string[],
  anNames: string[],
  kindJa: string,
  run: ClaudeRunner,
): Promise<SemanticPair[]> {
  if (pfNames.length === 0 || anNames.length === 0) return [];
  const raw = await run(buildSemanticPrompt(pfNames, anNames, kindJa));
  return parseSemanticPairs(raw, pfNames, anNames);
}
