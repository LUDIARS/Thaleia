// JSON ファイル永続化の下回り。 旧 store/snapshot.ts の「最新 + history 退避」機構をそのまま
// 一般化したもの (突合スナップショット専用だった型依存だけ外した)。
//
// Thaleia は DB を持たない。 data/ 配下の JSON がそのまま正本で、 前回比 diff は history から出す。

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** ファイル名に使える形へ落とす (Windows で `:` `.` が使えないため)。 */
export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
}

/** ISO timestamp を Windows でも安全なファイル名にする (`:`/`.` を `-`)。 辞書順 = 時系列順。 */
export function stampToFile(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/** JSON を読む。 未作成だけを null とし、破損や権限エラーは正本の障害として表面化させる。 */
export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** JSON を一時ファイルへ書いてから置換する (途中終了で正本を壊さない)。 */
export async function writeJson(file: string, value: unknown): Promise<string> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => { /* best-effort cleanup after failed write */ });
    throw error;
  }
  return file;
}

/** ディレクトリ内の .json を新しい順 (ファイル名降順) に列挙する。 無ければ空。 */
export async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .map((f) => join(dir, f));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return [];
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
