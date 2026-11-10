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

/** A complete three-section worksheet as the model returns it: one unit per section, ids colliding on purpose. */
const section = (
  index: number,
  type: Parameters<typeof unitOf>[0],
  items: Parameters<typeof unitOf>[1],
  grammarTags: string[],
) => {
  const { setId: _s, level: _l, createdAt: _c, ...rest } = unitOf(type, items);
  return {
    ...rest,
    id: `u${index}`,
    title: `Section ${index}`,
    instruction: `Instruction ${index}`,
    grammarTags,
  };
};

export const worksheetDraftFixture = {
  materialTitle: 'Feuille d’exercices',
  warnings: [],
  units: [
    section(1, 'FILL_BLANKS', [ITEMS.FILL_BLANKS, ITEMS.FILL_BLANKS_MULTI], ['present']),
    section(2, 'CHOICE_SELECT', [{ ...ITEMS.CHOICE_SELECT, id: 'fb-1' }], ['subject-object-pronouns']),
    section(3, 'MATCH_PAIRS', [ITEMS.MATCH_PAIRS], ['reading-comprehension']),
  ],
};
