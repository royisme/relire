/** Promote a complete drill set into one standalone workbook and one validated mixed sheet. No invented source text. */
import type { Article } from '../../types';
import { DrillsSchema, type Drills } from '../../types/exerciseAi';
import { ExerciseUnitSchema, type ExerciseUnit } from '../../types/exercises';
import type { GrammarTag } from '../../types/grammar';
import { InvalidAnswerError } from '../ai/errors';

export interface PreparedDrills {
  article: Article;
  unit: ExerciseUnit;
}

export function prepareDrills(
  value: Drills,
  targets: readonly GrammarTag[],
  level: string,
  makeId: () => string = () => crypto.randomUUID(),
): PreparedDrills {
  const drills = DrillsSchema.parse(value);
  for (const item of drills.items) {
    if (!targets.includes(item.grammarTag))
      throw new InvalidAnswerError('the drills', [`Item ${item.id} targets unrequested tag ${item.grammarTag}`]);
    if (item.type === 'READING_CLOZE')
      throw new InvalidAnswerError('the drills', [
        `Item ${item.id} requires a reading passage, which drills do not supply`,
      ]);
  }
  const article: Article = {
    id: `material-${makeId()}`,
    title: drills.drillTitle,
    content: '',
    kind: 'workbook',
    level,
    category: '',
    createdAt: new Date().toISOString(),
  };
  const unit = ExerciseUnitSchema.parse({
    id: `unit-${makeId()}`,
    materialId: article.id,
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
  return { article, unit };
}
