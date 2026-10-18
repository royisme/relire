/**
 * Turns the units a model wrote for an article into one new batch that can be
 * stored: fresh unit ids, numbers from 1, the batch's set id, title and level
 * (no link to the article), and no `articleQuote` (it has done its job in the
 * answerability check). Pure. Does not call the model or storage.
 */
import type { GeneratedSet } from '../../types/exerciseAi';
import type { ExerciseLevel, ExerciseUnit } from '../../types/exercises';

export function toStoredUnits(
  units: GeneratedSet['units'],
  options: {
    setId: string;
    setTitle?: string;
    level: ExerciseLevel;
    makeId?: () => string;
  },
): ExerciseUnit[] {
  const makeId = options.makeId ?? (() => `unit-${crypto.randomUUID()}`);
  return units.map((unit, index) => ({
    ...unit,
    id: makeId(),
    unitNumber: index + 1,
    setId: options.setId,
    setTitle: options.setTitle,
    level: options.level,
    items: unit.items.map(({ articleQuote: _quote, ...item }) => ({
      ...item,
      // The reference answer was written by the model, not printed in a book.
      answerSource: 'ai' as const,
    })),
  }));
}
