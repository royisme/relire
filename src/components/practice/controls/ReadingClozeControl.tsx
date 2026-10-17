/**
 * READING_CLOZE: the passage's sentences with typed `[___]` blanks, answered
 * exactly like FILL_BLANKS. The passage belongs to the unit, not the item, so
 * the sheet draws it: beside the questions from `md`, stacked above them on
 * phones, with an "Open in the reader" link to the material (see `UnitSheet`).
 */
import { FillBlanksControl } from './FillBlanksControl';
import type { ExerciseControlProps } from './types';

export function ReadingClozeControl(props: ExerciseControlProps) {
  return <FillBlanksControl {...props} />;
}
