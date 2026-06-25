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

/** 既定の claude runner を作る (bin / timeout を束ねる)。 */
export function makeClaudeRunner(bin: string, timeoutMs = DEFAULT_TIMEOUT_MS): ClaudeRunner {
  return (prompt) =>
    new Promise<string>((resolve, reject) => {
      let child;
      try {
        child = spawn(bin, ['-p'], { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        reject(new LlmError('llm_spawn_failed', String(e)));
        return;
      }
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new LlmError('llm_timeout', `timeout ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (d) => (out += String(d)));
      child.stderr.on('data', (d) => (err += String(d)));
      child.on('error', (e) => {
        clearTimeout(timer);
        // ENOENT 等。 ここで構造選択に黙って落とさない (無言 fallback 禁止)。
        reject(new LlmError('llm_unavailable', `${bin}: ${String(e)}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new LlmError('llm_failed', `exit ${code}: ${err.slice(0, 2000)}`));
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
  if (start < 0) throw new LlmError('llm_failed', `no JSON: ${trimmed.slice(0, 300)}`);
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  const end = body.lastIndexOf(close);
  if (end <= start) throw new LlmError('llm_failed', `no JSON close: ${trimmed.slice(0, 300)}`);
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch (e) {
    throw new LlmError('llm_failed', `bad JSON: ${String(e)}`);
  }
}
