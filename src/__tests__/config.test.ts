// config.ts の env 解決。 上流 URL と同じく「未設定なら null で、 勝手な既定値を作らない」を守る。

import { describe, expect, it, afterEach } from 'vitest';
import { loadConfig } from '../config.ts';

const KEYS = ['THALEIA_DATA_DIR', 'THALEIA_PORT'] as const;
const saved = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined): void {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe('dataDir', () => {
  it('未設定なら null (呼び出し側がリポジトリ同梱の data/ に落とす)', () => {
    for (const key of KEYS) setEnv(key, undefined);
    expect(loadConfig().dataDir).toBeNull();
  });

  it('THALEIA_DATA_DIR があればそれを返す (ランチャー配下へ実行時データを逃がす)', () => {
    setEnv('THALEIA_DATA_DIR', 'C:/Users/x/AppData/Roaming/Curia/thaleia');
    expect(loadConfig().dataDir).toBe('C:/Users/x/AppData/Roaming/Curia/thaleia');
  });

  it('空文字は未設定と同じ扱い', () => {
    setEnv('THALEIA_DATA_DIR', '   ');
    expect(loadConfig().dataDir).toBeNull();
  });
});
