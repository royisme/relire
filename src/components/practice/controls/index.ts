/**
 * Which control draws each exercise type. To build a type: write a component
 * that implements `ExerciseControl` (see ./types.ts) and replace
 * `ComingSoonControl` on that type's line below; nothing else changes. A type
 * left on the placeholder can be read but not answered or checked.
 */
import type { ExerciseType } from '../../../types/exercises';
import { ChoiceSelectControl } from './ChoiceSelectControl';
import { ComingSoonControl } from './ComingSoonControl';
import { FillBlanksControl } from './FillBlanksControl';
import { OpenQaControl } from './OpenQaControl';
import { WordTransformControl } from './WordTransformControl';
import type { ExerciseControl } from './types';

export type { ExerciseControl, ExerciseControlProps, TextInputElement } from './types';

export const CONTROLS: Record<ExerciseType, ExerciseControl> = {
  FILL_BLANKS: FillBlanksControl,
  CHOICE_SELECT: ChoiceSelectControl,
  WORD_TRANSFORM: WordTransformControl,
  OPEN_QA: OpenQaControl,
  GENDER_CHECK: ComingSoonControl,
  ODD_ONE_OUT: ComingSoonControl,
  MATCH_PAIRS: ComingSoonControl,
  DIALOGUE_ORDER: ComingSoonControl,
  SENTENCE_BUILD: ComingSoonControl,
  READING_CLOZE: ComingSoonControl,
  NUMBER_DICTATION: ComingSoonControl,
};

/** True while a type still has the placeholder: it has no way to be answered yet. */
export const isPlaceholder = (type: ExerciseType) => CONTROLS[type] === ComingSoonControl;
