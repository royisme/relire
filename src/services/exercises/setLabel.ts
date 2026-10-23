/** Localized topic titles and worksheet batch labels; pure, with no storage or locale ownership. */
import type { TFunction } from 'i18next';
import type { ExerciseUnit } from '../../types/exercises';

export const unitTitle = (unit: Pick<ExerciseUnit, 'title' | 'topicOrigin'>, language?: string): string =>
  unit.topicOrigin ? unit.topicOrigin.title[language === 'zh' ? 'zh' : 'en'] : unit.title;

export const setLabel = (
  t: TFunction,
  unit: Pick<ExerciseUnit, 'setId' | 'setTitle' | 'type' | 'topicOrigin'>,
  language?: string,
): string =>
  unit.topicOrigin
    ? unit.topicOrigin.title[language === 'zh' ? 'zh' : 'en']
    : (unit.setTitle ?? `${t(`exerciseTypes.${unit.type}.name`)} · ${unit.setId.slice(0, 4)}`);
