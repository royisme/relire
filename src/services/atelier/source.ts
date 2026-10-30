/**
 * What the sentence workshop screen needs from outside: the learner's choice
 * for a round, and the source that writes the items and grades the answers the
 * app cannot grade by itself. Types only; the AI calls and the dev fixture are
 * separate files.
 */
import type { AtelierItem, AtelierLevel } from '../../types/atelier';
import type { ThemeId } from '../../types/themes';

/** What the learner picks for a round: one of the major themes and a level. */
export interface RoundChoice {
  themeId: ThemeId;
  level: AtelierLevel;
}

export interface AtelierSource {
  /** One round of items that agree with themselves, and how many the boundary check dropped. */
  loadRound(choice: RoundChoice): Promise<{ items: AtelierItem[]; dropped: number }>;
  /** Judges an arrangement that matched no stored sentence. A rejection is a failed call, not a verdict. */
  grade(item: AtelierItem, userAnswer: string): Promise<{ isCorrect: boolean; feedback: string }>;
}
