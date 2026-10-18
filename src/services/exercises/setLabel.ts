/**
 * The name of an exercise batch, built from fields the unit already carries:
 * its set title when it has one, otherwise the exercise type and the first four
 * characters of the set id. For a batch, pass its first unit. Pure.
 */
import type { TFunction } from 'i18next';
import type { ExerciseUnit } from '../../types/exercises';

export const setLabel = (t: TFunction, unit: Pick<ExerciseUnit, 'setId' | 'setTitle' | 'type'>): string =>
  unit.setTitle ?? `${t(`exerciseTypes.${unit.type}.name`)} · ${unit.setId.slice(0, 4)}`;
