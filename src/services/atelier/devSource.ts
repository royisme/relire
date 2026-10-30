/**
 * DEV ONLY. Three hand-written items (`data/atelier/devItems.json`) so the owner can see and try the sentence
 * workshop before the AI calls exist. Reached only behind `import.meta.env.DEV`;
 * it never reaches a production build. It has no grader: an arrangement the
 * screen cannot grade by itself fails with a real error instead of inventing a verdict.
 */
import type { AtelierItem } from '../../types/atelier';
import devItems from '../../data/atelier/devItems.json';
import { parseRound } from './parse';
import type { AtelierSource } from './source';

const SLOW_MS = 600;

/** Checked once, here, exactly as the real source will check what the AI returns. */
function fixtureRound(): { items: AtelierItem[]; dropped: number } {
  const { items, dropped } = parseRound({ items: devItems });
  return { items, dropped: dropped.length };
}

export const devSource: AtelierSource = {
  loadRound: () => new Promise((resolve) => setTimeout(() => resolve(fixtureRound()), SLOW_MS)),
  grade: () => Promise.reject(new Error('The dev source has no AI grader, so this arrangement cannot be judged.')),
};
