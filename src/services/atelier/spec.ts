/**
 * The round-spec picker: which theme × subtopic × task one round draws from.
 * Randomness is injected, so a draw can be replayed in tests with a fixed
 * coin. Pure; no theme loading, no AI.
 */
import type { Subtopic, TaskId, Theme, ThemeId } from '../../types/themes';

export interface RoundSpec {
  theme: Theme;
  subtopic: Subtopic;
  taskId: TaskId;
  /** The theme's example for the task: prompt material for the generation. */
  example: { fr: string; zh: string };
}

/** Uniform choice over a nonempty list. */
const pickOne = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)];

export function pickRoundSpec(
  themes: readonly Theme[],
  choice: { themeId: ThemeId; subtopicId?: string; taskId?: TaskId },
  random: () => number,
): RoundSpec {
  const theme = themes.find((entry) => entry.id === choice.themeId);
  if (!theme) throw new RangeError(`No theme with id ${choice.themeId}`);

  let subtopic: Subtopic;
  if (choice.subtopicId !== undefined) {
    const found = theme.subtopics.find((entry) => entry.id === choice.subtopicId);
    if (!found) throw new RangeError(`No subtopic with id ${choice.subtopicId} in theme ${choice.themeId}`);
    if (choice.taskId !== undefined && !found.tasks.includes(choice.taskId))
      throw new RangeError(`Subtopic ${choice.subtopicId} does not list task ${choice.taskId}`);
    subtopic = found;
  } else {
    // ThemesSchema guarantees every task is covered, so the filtered pool is never empty.
    const { taskId } = choice;
    subtopic = pickOne(
      taskId === undefined ? theme.subtopics : theme.subtopics.filter((entry) => entry.tasks.includes(taskId)),
      random,
    );
  }

  const taskId = choice.taskId ?? pickOne(subtopic.tasks, random);
  return { theme, subtopic, taskId, example: theme.examples[taskId] };
}
