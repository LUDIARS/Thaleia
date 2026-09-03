// Augur CLI クライアント — テスト計画サービスを daemon なしで呼ぶ。
//
// Augur は常駐しない (project_augur_daemonless_cli)。 `node <bin> <verb>` を spawn し、
// stdout の JSON を読む。 bin 未設定 / 見つからない / 非 0 終了は AugurUnavailableError にして
// 呼び出し側が missing に積む (無言で「テスト 0 件」にはしない)。
//
// 使う 2 本:
//   augur tests list --repo <path> [--domain <d>] --json   登録済みテスト (回帰充足率の分母/分子)
//   augur review-plan --json  (stdin に CreatePlanRequest)  この変更に要る検査
// 契約は Augur の spec/interface/review-plan-cli.md / cli.md。

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 60_000;

/** review-plan が受ける request の contract version (Augur src/cli/reviewPlan.ts CONTRACT_VERSION)。 */
export const REVIEW_PLAN_CONTRACT_VERSION = 1;

export class AugurUnavailableError extends Error {
  constructor(
    public readonly verb: string,
    detail: string,
  ) {
    super(`augur ${verb}: ${detail}`);
    this.name = 'AugurUnavailableError';
  }
}

/** 登録済みテスト 1 件 (Thaleia が使う分)。 */
export interface AugurTest {
  id: string;
  name: string;
  kind: string;
  status: string;
  /** 業務/プログラムドメインの所属。 */
  domains: { business: string[]; program: string[] };
}

/** review-plan の応答 (Augur ReviewPlanResponse と同形)。 */
export interface AugurReviewPlan {
  stages: Array<{ id: string; run: boolean; reason: string }>;
  testCases: string[];
}

/** review-plan へ渡す変更プロファイル。 */
export interface AugurChangeProfile {
  kinds: string[];
  changedFiles: number;
  changedLines: number;
  docsOnly: boolean;
  touchesSpec: boolean;
  runtimeSurfaces: string[];
}

export interface AugurClient {
  listTests(input: { repoPath: string; domain?: string }): Promise<AugurTest[]>;
  reviewPlan(input: { repoPath: string; title: string; changeProfile: AugurChangeProfile }): Promise<AugurReviewPlan>;
}

export interface AugurClientOptions {
  /** `node <bin>` で起動する Augur の entry point。 */
  bin: string;
  timeoutMs?: number;
  /** テスト用の差し替え口 (既定は node spawn)。 */
  run?: AugurRunner;
}

/** 引数と stdin を渡して stdout を得る実行子。 */
export type AugurRunner = (args: string[], stdin: string) => Promise<string>;

export function makeAugurClient(opts: AugurClientOptions): AugurClient {
  const run = opts.run ?? makeNodeRunner(opts.bin, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  return {
    async listTests(input) {
      const args = ['tests', 'list', '--repo', input.repoPath, '--json'];
      if (input.domain) args.push('--domain', input.domain);
      const out = await run(args, '');
      const parsed = parseJson<unknown>('tests list', out);
      const rows: unknown[] = Array.isArray(parsed) ? parsed : [];
      return rows.map((raw) => {
        const t = raw as Record<string, unknown>;
        const domains = (t.domains ?? {}) as { business?: unknown; program?: unknown };
        return {
          id: String(t.id ?? ''),
          name: String(t.name ?? ''),
          kind: String(t.kind ?? ''),
          status: String(t.status ?? ''),
          domains: {
            business: Array.isArray(domains.business) ? domains.business.map(String) : [],
            program: Array.isArray(domains.program) ? domains.program.map(String) : [],
          },
        };
      });
    },

    async reviewPlan(input) {
      // stages / testCases は「候補」を渡して Augur に run 可否を決めさせる契約。 施策評価では
      // まだ PR が無いので、 候補は空で出して「この変更プロファイルなら必須になる検査」を得る。
      const request = {
        version: REVIEW_PLAN_CONTRACT_VERSION,
        repository: input.repoPath,
        pullRequest: { number: 0, title: input.title },
        changeProfile: {
          kinds: input.changeProfile.kinds,
          changedFiles: input.changeProfile.changedFiles,
          changedLines: input.changeProfile.changedLines,
          docsOnly: input.changeProfile.docsOnly,
          touchesSpec: input.changeProfile.touchesSpec,
          runtimeSurfaces: input.changeProfile.runtimeSurfaces,
        },
        stages: [],
        testCases: [],
        stageIds: [],
      };
      const out = await run(['review-plan', '--json'], JSON.stringify(request));
      const parsed = parseJson<{ stages?: unknown; testCases?: unknown }>('review-plan', out);
      return {
        stages: (Array.isArray(parsed.stages) ? parsed.stages : []).map((raw) => {
          const s = raw as Record<string, unknown>;
          return { id: String(s.id ?? ''), run: Boolean(s.run), reason: String(s.reason ?? '') };
        }),
        testCases: Array.isArray(parsed.testCases) ? parsed.testCases.map(String) : [],
      };
    },
  };
}

function parseJson<T>(verb: string, out: string): T {
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new AugurUnavailableError(verb, 'stdout が JSON ではない');
  }
}

/** `node <bin> <args>` を spawn する既定の実行子。 */
function makeNodeRunner(bin: string, timeoutMs: number): AugurRunner {
  return (args, stdin) =>
    new Promise<string>((resolve, reject) => {
      let child;
      try {
        child = spawn(process.execPath, [bin, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        reject(new AugurUnavailableError(args[0] ?? '', 'spawn に失敗した'));
        return;
      }
      let out = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new AugurUnavailableError(args[0] ?? '', `timeout ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (d) => (out += String(d)));
      // stderr はローカルパスや上流の診断を含み得るため、評価結果へ保存しない。
      child.stderr.resume();
      child.on('error', () => {
        clearTimeout(timer);
        reject(new AugurUnavailableError(args[0] ?? '', '起動できない'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        // 1 = usage/validation, 2 = Augur 内部エラー (Augur spec/interface/cli.md)。 どちらも missing。
        if (code !== 0) {
          reject(new AugurUnavailableError(args[0] ?? '', `exit ${code}`));
          return;
        }
        resolve(out);
      });

      child.stdin.write(stdin);
      child.stdin.end();
    });
}
