/** Pure mapping of one boundary-checked round onto the SENTENCE_BUILD unit it is saved and replayed through. */
import type { TFunction } from 'i18next';
import type { AtelierItem, AtelierLevel } from '../../types/atelier';
import { ExerciseUnitSchema, type ExerciseUnit } from '../../types/exercises';
import type { ThemeId } from '../../types/themes';
import { toExerciseItem } from '../atelier/toExerciseItem';

export interface AtelierUnitInput {
  themeId: ThemeId;
  level: AtelierLevel;
  /** The learner's language, for the prompt and the explanation. */
  language: 'zh' | 'en';
  makeId?: () => string;
  now?: () => number;
  t: TFunction;
}

/** One unit per round: every kept item in order, titled with the theme's own name. */
export function prepareAtelierUnit(
  items: AtelierItem[],
  { themeId, level, language, makeId = () => crypto.randomUUID(), now = () => Date.now(), t }: AtelierUnitInput,
): ExerciseUnit {
  const id = `unit-${makeId()}`;
  const title = t(`themes.${themeId}.name`);
  return ExerciseUnitSchema.parse({
    id,
    setId: makeId(),
    setTitle: title,
    createdAt: now(),
    level,
    learningArea: 'grammar',
    section: 'GRAMMAIRE',
    unitNumber: 1,
    title,
    instruction: t('atelier.drill.instruction'),
    type: 'SENTENCE_BUILD',
    grammarTags: [...new Set(items.map((item) => item.grammarTag))],
    items: items.map((item, index) =>
      toExerciseItem(item, { id: `${id}-${index + 1}`, itemNumber: index + 1, themeId, level, language }),
    ),
  });
}
