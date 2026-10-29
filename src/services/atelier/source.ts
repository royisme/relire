/**
 * What the sentence workshop screen needs from outside: the learner's concrete
 * choice for a round, and the source that writes the items and grades the
 * answers the app cannot grade by itself. Types and the pure choice resolver
 * only; the AI calls and the dev fixture are separate files.
 */
import type { AtelierItem, AtelierLevel } from '../../types/atelier';
import type { Theme, TaskId, ThemeId } from '../../types/themes';

/** A round's choice with nothing left random: saved units and prompts need concrete ids. */
export interface RoundChoice {
  themeId: ThemeId;
  subtopicId: string;
  taskId: TaskId;
  level: AtelierLevel;
}

export interface AtelierSource {
  /** One round of items that agree with themselves, and how many the boundary check dropped. */
  loadRound(choice: RoundChoice): Promise<{ items: AtelierItem[]; dropped: number }>;
  /** Judges an arrangement that matched no stored sentence. A rejection is a failed call, not a verdict. */
  grade(item: AtelierItem, userAnswer: string): Promise<{ isCorrect: boolean; feedback: string }>;
}

/** What the learner picked on the theme screen; a missing subtopic or task is left to chance. */
export interface RoundPicks {
  themeId: ThemeId;
  subtopicId?: string;
  taskId?: TaskId;
  level: AtelierLevel;
}

/**
 * Resolves the random parts of the picks. A task without a subtopic picks among
 * the subtopics that suit it; a subtopic without a task picks among its tasks.
 * `random` returns a number in [0, 1).
 */
export function resolveChoice(theme: Theme, picks: RoundPicks, random: () => number): RoundChoice {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  const subtopics = picks.taskId
    ? theme.subtopics.filter((subtopic) => subtopic.tasks.includes(picks.taskId!))
    : theme.subtopics;
  const subtopic = picks.subtopicId
    ? theme.subtopics.find((candidate) => candidate.id === picks.subtopicId)!
    : pick(subtopics);
  return {
    themeId: theme.id,
    subtopicId: subtopic.id,
    taskId: picks.taskId ?? pick(subtopic.tasks),
    level: picks.level,
  };
}
