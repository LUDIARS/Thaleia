// 凡庸性ルールの I/O 側。 Ludus の game-lexicon と Discutere の mechanics/aesthetics を集め、
// 純粋層 (banality.ts) へ渡す。 参照先は §8-3 A 案で「両方」。

import { missingFrom } from '../evaluators/axis.ts';
import { unconfigured, type EvaluationContext } from '../evaluators/context.ts';
import { assessBanality, type KnownPattern } from './banality.ts';
import type { BanalityResult, Missing } from '../initiative/types.ts';

/** 参照するゲームの上限 (Di 側)。 */
const MAX_GAMES = 40;

export async function evaluateBanality(context: EvaluationContext): Promise<BanalityResult> {
  const { deps, initiative } = context;
  const missing: Missing[] = [];
  const patterns: KnownPattern[] = [];

  if (!deps.ludus) {
    missing.push(unconfigured('ludus', 'LUDUS_REPO_DIR'));
  } else {
    try {
      const lexicon = await deps.ludus.loadLexicon();
      for (const pattern of lexicon.patterns) {
        patterns.push({
          source: 'ludus',
          name: `${pattern.name} (${pattern.category})`,
          text: [pattern.id, pattern.name, pattern.summary, ...pattern.tags, ...pattern.genres].join(' '),
        });
      }
      if (lexicon.skipped.length > 0) {
        missing.push({
          code: 'ludus_lexicon_entry_unreadable',
          reason: `Ludus lexicon の ${lexicon.skipped.length} 件を読み取れなかった`,
        });
      }
    } catch (e) {
      missing.push(missingFrom('ludus_lexicon_unavailable', e));
    }
  }

  if (!deps.discutere) {
    missing.push(unconfigured('discutere', 'DISCUTERE_BASE_URL'));
  } else {
    try {
      const games = await deps.discutere.listGamePatterns({ limit: MAX_GAMES });
      const gameId = initiative.ludus?.gameId ?? null;
      // gameId が指定されていればそのゲームを優先し、 無ければ全ゲームを参照する。
      const scoped = gameId ? games.filter((g) => g.gameId === gameId) : games;
      const source = scoped.length > 0 ? scoped : games;
      for (const game of source) {
        for (const mechanic of game.mechanics) {
          patterns.push({
            source: 'discutere',
            name: `${mechanic.name} (mechanics/${game.title})`,
            text: `${mechanic.name} ${mechanic.description ?? ''}`,
          });
        }
        for (const aesthetic of game.aesthetics) {
          patterns.push({
            source: 'discutere',
            name: `${aesthetic.name} (aesthetics/${game.title})`,
            text: `${aesthetic.name} ${aesthetic.description ?? ''}`,
          });
        }
      }
    } catch (e) {
      missing.push(missingFrom('discutere_patterns_unavailable', e));
    }
  }

  return assessBanality({
    text: `${initiative.title}\n${initiative.body}`,
    patterns,
    penaltyK: deps.config.banalityK,
    missing,
  });
}
