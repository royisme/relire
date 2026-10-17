/**
 * The one interface every exercise control implements. A control draws how one
 * item is answered (blanks, choices, a text area, …) and reports the learner's
 * answer through `onChange`; it never grades, saves, checks or handles Enter.
 * The sheet row around it does those, using the inputs the control registers.
 * To add a control: implement `ExerciseControl`, then point the type at it in `./index.ts`.
 */
import type { ComponentType } from 'react';
import type { CheckedResult, ExerciseAnswer, ExerciseItem, ExerciseType } from '../../../types/exercises';

/** A text field a control renders. The sheet drives Enter and the character bar through these. */
export type TextInputElement = HTMLInputElement | HTMLTextAreaElement;

export interface ExerciseControlProps {
  item: ExerciseItem;
  /** Lookup for source text only, never inside answer buttons or tiles. */
  onWord: (word: string, sentence: string) => void;
  /** The item's effective type: its own override, else its unit's. */
  type: ExerciseType;
  /** What the learner has entered. A control writes only the field(s) it owns and leaves the rest. */
  answer: ExerciseAnswer;
  onChange: (answer: ExerciseAnswer) => void;
  /** Null until the item is checked. Once set, show right and wrong (and the reference answer beside a wrong one). */
  checked: CheckedResult | null;
  /** True while the answer cannot be edited: a check is running, or the item is checked. Keep the answer visible. */
  disabled: boolean;
  /**
   * Call with each text field when it mounts and with `null` when it unmounts (a ref callback does this),
   * numbering the fields from 0 in reading order. Fields that are not registered get no Enter handling
   * and no character bar.
   */
  registerInput: (slot: number, element: TextInputElement | null) => void;
}

export type ExerciseControl = ComponentType<ExerciseControlProps>;
