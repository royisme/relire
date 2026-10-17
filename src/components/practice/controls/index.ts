/**
 * Which control draws each exercise type. To build a type: write a component
 * that implements `ExerciseControl` (see ./types.ts) and point the type at it
 * below; nothing else changes. Every type of the 11 has its own control, so
 * every item can be answered and checked.
 */
import type { ExerciseType } from '../../../types/exercises';
import { ChoiceSelectControl } from './ChoiceSelectControl';
import { DialogueOrderControl } from './DialogueOrderControl';
import { FillBlanksControl } from './FillBlanksControl';
import { GenderCheckControl } from './GenderCheckControl';
import { MatchPairsControl } from './MatchPairsControl';
import { NumberDictationControl } from './NumberDictationControl';
import { OddOneOutControl } from './OddOneOutControl';
import { OpenQaControl } from './OpenQaControl';
import { ReadingClozeControl } from './ReadingClozeControl';
import { SentenceBuildControl } from './SentenceBuildControl';
import { WordTransformControl } from './WordTransformControl';
import type { ExerciseControl } from './types';

export type { ExerciseControl, ExerciseControlProps, TextInputElement } from './types';

export const CONTROLS: Record<ExerciseType, ExerciseControl> = {
  FILL_BLANKS: FillBlanksControl,
  CHOICE_SELECT: ChoiceSelectControl,
  WORD_TRANSFORM: WordTransformControl,
  OPEN_QA: OpenQaControl,
  GENDER_CHECK: GenderCheckControl,
  ODD_ONE_OUT: OddOneOutControl,
  MATCH_PAIRS: MatchPairsControl,
  DIALOGUE_ORDER: DialogueOrderControl,
  SENTENCE_BUILD: SentenceBuildControl,
  READING_CLOZE: ReadingClozeControl,
  NUMBER_DICTATION: NumberDictationControl,
};
