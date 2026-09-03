// Ludus クライアント — ゲーム辞書 (game-lexicon) をリポのファイルから直接読む。
//
// Ludus は Web サービスではなく、 辞書の正本は `spec/data/game-lexicon/**.toml`
// (Ludus spec/data/game-lexicon/README.md: 「crates/ars-game-lexicon がここを唯一の真実として読む」)。
// パターン一覧 API は存在しないので、 設計 §4.6 の指示どおりファイルを読む。
//
// TOML は id / name_ja / name_en / summary / tags / genres の **トップレベルのスカラー値** しか要らない。
// パーサ依存を増やさず、 最初の [table] より前の行だけを読む小さな読み取りに留める
// (読み取れなかったファイルは黙って無視せず skipped に積んで呼び出し側へ返す)。

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 辞書の 1 パターン (feature / genre / preset / term)。 */
export interface LudusPattern {
  id: string;
  /** 表示名 (name_ja 優先、 無ければ name_en、 無ければ id)。 */
  name: string;
  summary: string;
  tags: string[];
  genres: string[];
  /** 分類 (features / genres / presets / terms)。 */
  category: string;
  /** リポルートからの相対パス (evidence 表示用)。 */
  file: string;
}

export interface LudusLexicon {
  patterns: LudusPattern[];
  /** 読めなかったファイル (相対パス + 理由)。 */
  skipped: Array<{ file: string; reason: string }>;
  /** 実際に読んだ辞書ディレクトリ。 */
  lexiconDir: string;
}

export class LudusUnavailableError extends Error {
  constructor(detail: string) {
    super(`ludus lexicon: ${detail}`);
    this.name = 'LudusUnavailableError';
  }
}

/** 辞書ディレクトリ (Ludus リポルートからの相対)。 */
export const LEXICON_RELATIVE_DIR = 'spec/data/game-lexicon';

export interface LudusClient {
  /** game-lexicon の全パターンを読む。 */
  loadLexicon(): Promise<LudusLexicon>;
}

export interface LudusClientOptions {
  /** Ludus リポのルート。 */
  repoDir: string;
}

export function makeLudusClient(opts: LudusClientOptions): LudusClient {
  const lexiconDir = join(opts.repoDir, ...LEXICON_RELATIVE_DIR.split('/'));

  return {
    async loadLexicon() {
      let files: string[];
      try {
        files = await collectToml(lexiconDir);
      } catch {
        throw new LudusUnavailableError('辞書ディレクトリを読めない');
      }
      if (files.length === 0) {
        throw new LudusUnavailableError('辞書ディレクトリに .toml が無い');
      }
      const patterns: LudusPattern[] = [];
      const skipped: Array<{ file: string; reason: string }> = [];
      for (const absolute of files) {
        const relative = absolute.slice(lexiconDir.length + 1).replace(/\\/g, '/');
        try {
          const parsed = parseLexiconEntry(await readFile(absolute, 'utf8'));
          const id = parsed.id || relative.replace(/\.toml$/, '').split('/').pop() || relative;
          patterns.push({
            id,
            name: parsed.nameJa || parsed.nameEn || id,
            summary: parsed.summary,
            tags: parsed.tags,
            genres: parsed.genres,
            category: relative.split('/')[0] ?? '',
            file: `${LEXICON_RELATIVE_DIR}/${relative}`,
          });
        } catch {
          skipped.push({ file: `${LEXICON_RELATIVE_DIR}/${relative}`, reason: 'TOML を読み取れない' });
        }
      }
      return { patterns, skipped, lexiconDir };
    },
  };
}

/** .toml を再帰列挙する (POSIX find は使わない)。 */
async function collectToml(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectToml(full)));
    else if (entry.isFile() && entry.name.endsWith('.toml')) out.push(full);
  }
  return out.sort();
}

/** 読み取れたトップレベルの値。 */
interface LexiconEntryFields {
  id: string;
  nameJa: string;
  nameEn: string;
  summary: string;
  tags: string[];
  genres: string[];
}

/**
 * game-lexicon の TOML から必要なトップレベル値だけ読む。
 *
 * 対応する範囲: `key = "文字列"` と `key = ["a", "b"]` を、 最初の `[table]` / `[[table]]` 行まで。
 * パラメータ表 (`[[parameter]]`) は凡庸性判定に使わないので読まない。
 */
export function parseLexiconEntry(text: string): LexiconEntryFields {
  const fields: LexiconEntryFields = { id: '', nameJa: '', nameEn: '', summary: '', tags: [], genres: [] };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[')) break; // ここから下はテーブル。 トップレベルは終わり。
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    switch (key) {
      case 'id':
        fields.id = readString(value);
        break;
      case 'name_ja':
        fields.nameJa = readString(value);
        break;
      case 'name_en':
        fields.nameEn = readString(value);
        break;
      case 'summary':
        fields.summary = readString(value);
        break;
      case 'tags':
        fields.tags = readStringArray(value);
        break;
      case 'genres':
        fields.genres = readStringArray(value);
        break;
      default:
        break;
    }
  }
  return fields;
}

function readString(value: string): string {
  const m = value.match(/^"([^"]*)"$/) ?? value.match(/^'([^']*)'$/);
  return m?.[1] ?? '';
}

function readStringArray(value: string): string[] {
  const inner = value.match(/^\[(.*)\]$/)?.[1];
  if (inner === undefined) return [];
  return inner
    .split(',')
    .map((part) => readString(part.trim()))
    .filter((part) => part !== '');
}
