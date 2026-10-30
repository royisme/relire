/**
 * The sentence workshop's real source: the learner's own key draws each round
 * from the theme taxonomy and judges the arrangements the app cannot settle by
 * itself. Nothing is cached and nothing is substituted; a failure reaches the
 * screen with its real message.
 */
import type { AtelierItem } from '../../types/atelier';
import { generateAtelierRound, gradeAtelierBuild } from '../api';
import { loadThemes } from '../themes/load';
import type { AtelierSource, RoundChoice } from './source';

/** One round is five items (owner decision, 2026-10-29). */
const ROUND_ITEMS = 5;

export function createAiSource(): AtelierSource {
  return {
    async loadRound(choice: RoundChoice) {
      const theme = (await loadThemes()).find((candidate) => candidate.id === choice.themeId);
      if (!theme) throw new Error(`The theme taxonomy has no theme "${choice.themeId}".`);
      const round = await generateAtelierRound({ theme, level: choice.level, count: ROUND_ITEMS });
      return { items: round.items, dropped: round.dropped.length };
    },
    async grade(item: AtelierItem, userAnswer: string) {
      const grade = await gradeAtelierBuild({ item, userAnswer });
      return { isCorrect: grade.isCorrect, feedback: grade.feedback };
    },
  };
}
