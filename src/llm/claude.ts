// LLM 呼び出し — LUDIARS 規約により API は使わず claude CLI (`claude -p`) を spawn する。
//
// 注意 (memory): 長いプロンプトは stdin で渡す。 Windows では claude CLI が git-bash を
// 必要とする場合がある (THALEIA_CLAUDE_BIN で wrapper を差せる)。 失敗時は無言 fallback
// せず明示エラー (= 構造選択へ黙って戻さない。 呼ぶと決めたら成否を返す)。

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 120_000;

/** claude CLI 実行で起きうる失敗の種別。 route がそのまま 5xx に写せる。 */
export class LlmError extends Error {
  constructor(
    public readonly code: 'llm_unavailable' | 'llm_spawn_failed' | 'llm_timeout' | 'llm_failed',
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** claude CLI を non-interactive (`-p`) で叩き stdout を返す。 プロンプトは stdin 経由。 */
export type ClaudeRunner = (prompt: string) => Promise<string>;

/**
 * 既定の claude runner を作る (bin / model / timeout を束ねる)。
 *
 * `--model` は必ず固定する。 既定モデル任せにすると上限切れの巻き添えで無言終了し、
 * 「LLM が動いていない」ことに気づけない (LUDIARS 運用則)。
 */
export function makeClaudeRunner(
  bin: string,
  model: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): ClaudeRunner {
  return (prompt) =>
    new Promise<string>((resolve, reject) => {
      let child;
      try {
        child = spawn(bin, ['-p', '--model', model], { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        reject(new LlmError('llm_spawn_failed', 'claude CLI の spawn に失敗した'));
        return;
      }
      let out = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new LlmError('llm_timeout', `timeout ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (d) => (out += String(d)));
      // stderr はローカル設定や診断を含み得るため、評価結果へ保存しない。
      child.stderr.resume();
      child.on('error', () => {
        clearTimeout(timer);
        // ENOENT 等。 ここで構造選択に黙って落とさない (無言 fallback 禁止)。
        reject(new LlmError('llm_unavailable', 'claude CLI を起動できない'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new LlmError('llm_failed', `claude CLI が exit ${code} で終了した`));
          return;
        }
        resolve(out);
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
}

/** モデル出力から最初の JSON ブロック ({...} or [...]) を取り出して parse する。 */
export function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence?.[1] ?? trimmed;
  const start = body.search(/[[{]/);
  if (start < 0) throw new LlmError('llm_failed', 'LLM 応答に JSON が無い');
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  const end = body.lastIndexOf(close);
  if (end <= start) throw new LlmError('llm_failed', 'LLM 応答の JSON が閉じていない');
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    throw new LlmError('llm_failed', 'LLM 応答の JSON を解析できない');
  }
}
