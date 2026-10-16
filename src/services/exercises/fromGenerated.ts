/**
 * Turns the units a model wrote for an article into units that can be stored:
 * fresh unit ids, numbers that continue after the material's existing units,
 * the article as owner (added by `saveUnits`), and no `articleQuote` (it has
 * done its job in the answerability check). Pure. Does not call the model or storage.
 */
import type { GeneratedSet } from '../../types/exerciseAi';
import type { ExtractedUnit } from '../../types/exercises';

export function toStoredUnits(
  units: GeneratedSet['units'],
  options: {
    /** `unitNumber` of the first new unit: one past the highest number the material already has. */
    firstNumber: number;
    makeId?: () => string;
  },
): ExtractedUnit[] {
  const makeId = options.makeId ?? (() => `unit-${crypto.randomUUID()}`);
  return units.map((unit, index) => ({
    ...unit,
    id: makeId(),
    unitNumber: options.firstNumber + index,
    items: unit.items.map(({ articleQuote: _quote, ...item }) => ({
      ...item,
      // The reference answer was written by the model, not printed in a book.
      answerSource: 'ai' as const,
    })),
  }));
}
