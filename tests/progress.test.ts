import { expect, test } from 'bun:test';
import { choicePieces, restoreAnswer } from '../src/services/exercises/answer';
import { toStoredUnits } from '../src/services/exercises/fromGenerated';
import { unitProgress } from '../src/services/exercises/progress';
import { ExerciseUnitSchema, type ExerciseItemState } from '../src/types/exercises';
import { ITEMS, unitOf } from './fixtures/units';

const state = (itemId: string, correct: boolean | null): ExerciseItemState => ({
  id: `u:${itemId}`,
  unitId: 'u',
  itemId,
  answer: {} as ExerciseItemState['answer'],
  checked: correct === null ? null : { correct, strictAccents: false },
  hintShown: false,
  explanationShown: false,
  updatedAt: 0,
});

test('progress counts checked and correct items of the unit, not drafts or items it no longer has', () => {
  const unit = unitOf('FILL_BLANKS', [ITEMS.FILL_BLANKS, ITEMS.FILL_BLANKS_MULTI]);
  expect(unitProgress(unit, [])).toEqual({ total: 2, checked: 0, correct: 0 });
  expect(unitProgress(unit, [state('fb-1', true), state('fb-2', null)])).toEqual({ total: 2, checked: 1, correct: 1 });
  expect(unitProgress(unit, [state('fb-1', false), state('fb-2', true), state('gone', true)])).toEqual({
    total: 2,
    checked: 2,
    correct: 1,
  });
});

test('a stored answer is fitted to the item as it is now', () => {
  const two = { prompt: 'Tu [___] polonais et elle [___] belge.' };
  expect(restoreAnswer(two, { multiAnswers: ['es'] }).multiAnswers).toEqual(['es', '']);
  expect(restoreAnswer(two, { multiAnswers: ['es', 'est', 'extra'] }).multiAnswers).toEqual(['es', 'est']);
  expect(restoreAnswer({ prompt: 'Je [___].' }, {}).multiAnswers).toEqual([]);
  expect(restoreAnswer({ prompt: 'Je {suis|es}' }, { choiceSelections: [] }).choiceSelections).toEqual(['']);
  const lines = { prompt: 'Ordre', options: ['a – x', 'b – y'] };
  expect(restoreAnswer(lines, { dialogueOrder: [] }).dialogueOrder).toEqual(['a – x', 'b – y']);
  expect(restoreAnswer(lines, { dialogueOrder: ['b – y', 'a – x'] }).dialogueOrder).toEqual(['b – y', 'a – x']);
});

test('a sentence with choices is cut into text and numbered groups', () => {
  expect(choicePieces("Vous {êtes|s'appelle} madame ? – Oui, {c'est|je} m'appelle Pauline.")).toEqual([
    { kind: 'text', text: 'Vous ' },
    { kind: 'group', index: 0, options: ['êtes', "s'appelle"] },
    { kind: 'text', text: ' madame ? – Oui, ' },
    { kind: 'group', index: 1, options: ["c'est", 'je'] },
    { kind: 'text', text: " m'appelle Pauline." },
  ]);
  expect(choicePieces('Pas de choix.')).toEqual([{ kind: 'text', text: 'Pas de choix.' }]);
});

test('generated units become one storable batch: fresh ids, numbers from 1, set id, title and level, AI answer source, no quote', () => {
  const { setId: _set, level: _level, ...base } = unitOf('FILL_BLANKS', [ITEMS.FILL_BLANKS]);
  const generated = [
    { ...base, id: 'u1', unitNumber: 1, items: [{ ...ITEMS.FILL_BLANKS, articleQuote: 'Je suis' }] },
    { ...base, id: 'u2', unitNumber: 2 },
  ];
  let n = 0;
  const batch = { setId: 'set-9', setTitle: 'Le matin', level: 'A2' as const };
  const stored = toStoredUnits(generated, { ...batch, makeId: () => `fresh-${++n}` });
  expect(stored.map((unit) => [unit.id, unit.unitNumber])).toEqual([
    ['fresh-1', 1],
    ['fresh-2', 2],
  ]);
  for (const unit of stored) expect(unit).toMatchObject(batch);
  expect(stored[0].items[0].answerSource).toBe('ai');
  expect('articleQuote' in stored[0].items[0]).toBe(false);
  for (const unit of stored) expect(ExerciseUnitSchema.safeParse(unit).success).toBe(true);
  // Without an injected id source, ids are unique.
  const real = toStoredUnits(generated, batch);
  expect(new Set(real.map((unit) => unit.id)).size).toBe(2);
  expect(real[0].id).not.toBe('u1');
});
