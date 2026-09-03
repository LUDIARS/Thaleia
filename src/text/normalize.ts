// 名寄せ・語彙正規化の純粋関数。 撤去した突合モジュールから評価側へ引き継いだ共通処理。
//
// 施策評価では 2 用途に使う:
//   1. LLM が抽出したドメイン候補を Anatomia の検出ドメイン名へ名寄せする (実装コスト / ドメイン解析軸)
//   2. 企画本文を語に割って既存パターン集合との重なりを測る (凡庸性ルールの embedding 代替)

/** 名寄せ用の正規化: NFKC + 小文字化 + 空白/記号除去。 "Player Move" ↔ "player-move" を一致させる。 */
export function normalizeName(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[\s_\-./]+/g, '');
}

/** トークン化で落とす語 (日英の機能語)。 重なり率が助詞・冠詞で嵩上げされるのを防ぐ。 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'be',
  'this', 'that', 'it', 'as', 'by', 'at', 'from', 'system', 'feature',
  'する', 'した', 'して', 'ある', 'いる', 'こと', 'もの', 'ため', 'よう', 'から', 'まで',
]);

/**
 * 語彙トークン列を作る。 embedding が無い環境で「語の重なり」を類似度の代替にするための前処理。
 *
 * 日本語は形態素解析器を持たないので、 ラテン文字/数字の語と、 連続する漢字・カタカナの塊
 * (2 文字以上) を語として扱う。 ひらがなだけの塊は機能語になりやすいので採らない。
 * この近似は凡庸性 evidence に方式として明記する (無言フォールバック禁止)。
 */
export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9_+#-]*/g) ?? [];
  const cjk = normalized.match(/[\u4e00-\u9fff\u30a0-\u30ff]{2,}/g) ?? [];
  const out: string[] = [];
  for (const token of [...latin, ...cjk]) {
    if (token.length < 2) continue;
    if (STOP_WORDS.has(token)) continue;
    out.push(token);
  }
  return out;
}

/** トークン集合 (重複除去)。 */
export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/**
 * 2 つのトークン集合の重なり率 (Szymkiewicz-Simpson 係数)。
 *
 * Jaccard ではなく overlap 係数を使うのは、 「短いパターン定義」と「長い企画本文」を比べるため。
 * Jaccard だと本文が長いほど機械的に低くなり、 凡庸さの判定にならない。
 */
export function overlapCoefficient(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  if (smaller.size === 0) return 0;
  let hit = 0;
  for (const token of smaller) if (larger.has(token)) hit += 1;
  return hit / smaller.size;
}
