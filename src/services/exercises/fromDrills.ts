/** Promote a complete drill set into one new batch holding one validated mixed sheet. No invented source text. */
import { DrillsSchema, type Drills } from '../../types/exerciseAi';
import { ExerciseUnitSchema, type ExerciseLevel, type ExerciseUnit } from '../../types/exercises';
import type { GrammarTag } from '../../types/grammar';
import { InvalidAnswerError } from '../ai/errors';

export function prepareDrills(
  value: Drills,
  targets: readonly GrammarTag[],
  level: ExerciseLevel,
  makeId: () => string = () => crypto.randomUUID(),
): ExerciseUnit {
  const drills = DrillsSchema.parse(value);
  for (const item of drills.items) {
    if (!targets.includes(item.grammarTag))
      throw new InvalidAnswerError('the drills', [`Item ${item.id} targets unrequested tag ${item.grammarTag}`]);
    if (item.type === 'READING_CLOZE')
      throw new InvalidAnswerError('the drills', [
        `Item ${item.id} requires a reading passage, which drills do not supply`,
      ]);
  }
  return ExerciseUnitSchema.parse({
    id: `unit-${makeId()}`,
    setId: makeId(),
    setTitle: drills.drillTitle,
    level,
    section: 'EXTRA',
    unitNumber: 1,
    title: drills.drillTitle,
    instruction: drills.focusSummary,
    type: drills.items[0].type,
    grammarTags: [...new Set(drills.items.map((item) => item.grammarTag))],
    items: drills.items.map((item, index) => ({
      ...item,
      id: `item-${makeId()}`,
      itemNumber: index + 1,
      answerSource: 'ai',
    })),
  });
}
