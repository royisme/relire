/** An incomplete but valid import draft: one item with no reference answer yet. */
import { ITEMS, unitOf } from './units';

const {
  setId: _setId,
  level: _level,
  createdAt: _createdAt,
  ...unit
} = unitOf('WORD_TRANSFORM', [ITEMS.WORD_TRANSFORM]);

export const draftFixture = {
  materialTitle: 'Mon document',
  warnings: [],
  units: [
    {
      ...unit,
      items: [{ ...ITEMS.WORD_TRANSFORM, expectedAnswer: null, printedAnswer: null, blockers: [] }],
    },
  ],
};
