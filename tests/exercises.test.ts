import { beforeEach, expect, spyOn, test } from 'bun:test';
import { answered, answeredMulti, failure, freshDb, putArticle, right, seedUnit, wrong } from './fixtures/storage';
import { ITEMS, unitOf } from './fixtures/units';
import { db, deleteArticleData, deleteSetData } from '../src/storage/db';
import {
  DuplicateUnitError,
  ItemGoneError,
  StaleResetError,
  UnitGoneError,
  accuracyByGrammarTag,
  checkItem,
  deleteUnit,
  getItemState,
  getResetToken,
  getUnit,
  listAttempts,
  listItemStates,
  listMistakes,
  listUnits,
  resetUnit,
  saveItemProgress,
  saveUnits,
  subscribeExercises,
} from '../src/storage/exercises';

beforeEach(freshDb);

const CLASH = 'clash-0-0-0-0';
const FIRST = ITEMS.FILL_BLANKS.id;
const SECOND = ITEMS.FILL_BLANKS_MULTI.id;

test('saveUnits stores a batch and lists every unit in unit order, each keeping its set id, title and level', async () => {
  const later = { ...unitOf('OPEN_QA'), id: 'b', unitNumber: 2, setTitle: 'Lesson 1', level: 'B2' as const };
  const earlier = { ...unitOf('WORD_TRANSFORM'), id: 'a', unitNumber: 1, setTitle: 'Lesson 1', level: 'B2' as const };
  await saveUnits([later, earlier]);
  await saveUnits([{ ...unitOf('GENDER_CHECK'), id: 'c', unitNumber: 3, setId: 'set-2' }]);
  expect((await listUnits()).map((unit) => unit.id)).toEqual(['a', 'b', 'c']);
  expect(await getUnit('a')).toMatchObject({ setId: 'set-1', setTitle: 'Lesson 1', level: 'B2' });
  expect((await getUnit('c'))?.setTitle).toBeUndefined();
  expect(await (await db()).getAllKeysFromIndex('units', 'setId', 'set-1')).toEqual(['a', 'b']);
});

test('saveUnits rejects a duplicate id, a mixed batch, a missing level and an invalid unit without storing anything', async () => {
  await seedUnit();
  const fresh = { ...unitOf('OPEN_QA'), id: 'fresh' };
  expect(await failure(saveUnits([fresh, { ...fresh, id: 'unit-set-1' }]))).toBeInstanceOf(DuplicateUnitError);
  expect(await getUnit('fresh')).toBeUndefined();

  expect(await failure(saveUnits([fresh, { ...fresh, id: 'other', setId: 'set-9' }]))).toBeInstanceOf(Error);
  expect(await getUnit('fresh')).toBeUndefined();

  const { level: _level, ...unleveled } = fresh;
  expect(await failure(saveUnits([unleveled as typeof fresh]))).toBeInstanceOf(Error);
  expect(await getUnit('fresh')).toBeUndefined();

  const broken = { ...unitOf('FILL_BLANKS'), id: 'broken', items: [] };
  expect(await failure(saveUnits([broken]))).toBeInstanceOf(Error);
  expect(await getUnit('broken')).toBeUndefined();
});

test('checking an item writes the state and the attempt together, deriving the attempt from the stored unit', async () => {
  const unit = await seedUnit();
  const token = await getResetToken(unit.id);
  const { created, state } = await checkItem({
    unitId: unit.id,
    itemId: FIRST,
    resetToken: token,
    answer: answered('suis'),
    result: right,
  });
  expect(created).toBe(true);
  expect(state.checked).toEqual(right);
  expect(await getItemState(unit.id, FIRST)).toEqual(state);

  const [attempt] = await listAttempts();
  expect(attempt).toMatchObject({
    unitId: unit.id,
    itemId: FIRST,
    grammarTag: 'present',
    prompt: 'Je [___] française.',
    userAnswer: 'suis',
    expectedAnswer: 'suis',
    correct: true,
  });
});

test('a failed attempt write rolls the item state back and rejects', async () => {
  const unit = await seedUnit();
  await (await db()).put('attempts', { ...(await seedAttempt(unit.id)), id: CLASH });
  const uuid = spyOn(crypto, 'randomUUID').mockReturnValue(CLASH);
  let failure: unknown;
  try {
    await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('suis'), result: right });
  } catch (err) {
    failure = err;
  } finally {
    uuid.mockRestore();
  }
  expect(failure).toBeDefined();
  expect(await getItemState(unit.id, FIRST)).toBeUndefined();
  expect(await listAttempts()).toHaveLength(1); // only the pre-existing one
});

async function seedAttempt(unitId: string) {
  return {
    id: 'seed',
    unitId,
    itemId: FIRST,
    grammarTag: 'present' as const,
    prompt: 'p',
    userAnswer: 'a',
    expectedAnswer: 'b',
    correct: false,
    timestamp: 1,
  };
}

test('checking an already checked item returns the committed state and no second attempt', async () => {
  const unit = await seedUnit();
  const first = await checkItem({
    unitId: unit.id,
    itemId: FIRST,
    resetToken: 0,
    answer: answered('suis'),
    result: right,
  });
  const second = await checkItem({
    unitId: unit.id,
    itemId: FIRST,
    resetToken: 0,
    answer: answered('es'),
    result: { ...wrong, strictAccents: true },
  });
  expect(second.created).toBe(false);
  expect(second.state).toEqual(first.state);
  expect(second.state.checked?.strictAccents).toBe(false);
  expect(await listAttempts()).toHaveLength(1);
});

test('a draft saves state only, never overwrites a checked item and keeps hint flags', async () => {
  const unit = await seedUnit();
  const attemptsBefore = await listAttempts();
  const draft = await saveItemProgress(unit.id, FIRST, 0, { answer: answered('su') });
  expect(draft.checked).toBeNull();
  expect(draft.answer.singleAnswer).toBe('su');
  expect(await listAttempts()).toEqual(attemptsBefore);

  await saveItemProgress(unit.id, FIRST, 0, { hintShown: true });
  const { state } = await checkItem({
    unitId: unit.id,
    itemId: FIRST,
    resetToken: 0,
    answer: answered('suis'),
    result: right,
  });
  expect(state.hintShown).toBe(true);

  const late = await saveItemProgress(unit.id, FIRST, 0, { answer: answered('late'), explanationShown: true });
  expect(late.answer.singleAnswer).toBe('suis');
  expect(late.checked).toEqual(right);
  expect(late.explanationShown).toBe(true);
});

test('writes for a missing unit or item reject', async () => {
  const unit = await seedUnit();
  expect(await failure(saveItemProgress('nope', FIRST, 0, {}))).toBeInstanceOf(UnitGoneError);
  expect(
    await failure(checkItem({ unitId: 'nope', itemId: FIRST, resetToken: 0, answer: answered('x'), result: wrong })),
  ).toBeInstanceOf(UnitGoneError);
  expect(await failure(saveItemProgress(unit.id, 'nope', 0, {}))).toBeInstanceOf(ItemGoneError);
  expect(await listAttempts()).toEqual([]);
});

test('reset clears current states, keeps attempts, and rejects writes from before the reset', async () => {
  const unit = await seedUnit();
  const before = await getResetToken(unit.id);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: before, answer: answered('es'), result: wrong });
  await saveItemProgress(unit.id, SECOND, before, { hintShown: true });

  const after = await resetUnit(unit.id);
  expect(after).toBeGreaterThan(before);
  expect(await getResetToken(unit.id)).toBe(after);
  expect(await listItemStates(unit.id)).toEqual([]);
  expect(await listAttempts()).toHaveLength(1);

  // An AI grade and a hint that were already in flight arrive late.
  expect(
    await failure(
      checkItem({ unitId: unit.id, itemId: SECOND, resetToken: before, answer: answeredMulti('x'), result: right }),
    ),
  ).toBeInstanceOf(StaleResetError);
  expect(await failure(saveItemProgress(unit.id, SECOND, before, { hintShown: true }))).toBeInstanceOf(StaleResetError);
  expect(await listItemStates(unit.id)).toEqual([]);
  expect(await listAttempts()).toHaveLength(1);

  // Work started after the reset is accepted, and the same item can be checked again.
  const again = await checkItem({
    unitId: unit.id,
    itemId: FIRST,
    resetToken: after,
    answer: answered('suis'),
    result: right,
  });
  expect(again.created).toBe(true);
  expect(await listAttempts()).toHaveLength(2);
});

test('deleting a unit removes its states, keeps its attempts and invalidates its writers', async () => {
  const unit = await seedUnit();
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('suis'), result: right });
  expect(await deleteUnit(unit.id)).toBe(true);
  expect(await deleteUnit(unit.id)).toBe(false);
  expect(await getUnit(unit.id)).toBeUndefined();
  expect(await listItemStates(unit.id)).toEqual([]);
  expect(await listAttempts()).toHaveLength(1);

  // The same id saved again must not accept a writer from the deleted unit.
  await saveUnits([{ ...unitOf('FILL_BLANKS', [ITEMS.FILL_BLANKS]), id: unit.id }]);
  expect(await failure(saveItemProgress(unit.id, FIRST, 0, { hintShown: true }))).toBeInstanceOf(StaleResetError);
});

test('deleting an article leaves generated units, their states and attempts untouched', async () => {
  await putArticle('material-1');
  const unit = await seedUnit();
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('suis'), result: right });

  await deleteArticleData('material-1');
  expect(await (await db()).get('articles', 'material-1')).toBeUndefined();
  expect(await getUnit(unit.id)).toEqual(unit);
  expect(await listItemStates(unit.id)).toHaveLength(1);
  expect(await listAttempts()).toHaveLength(1);
});

test('deleting a set removes its units and states, keeps attempts and invalidates its writers', async () => {
  const mine = await seedUnit('set-1');
  const other = await seedUnit('set-2');
  await checkItem({ unitId: mine.id, itemId: FIRST, resetToken: 0, answer: answered('suis'), result: right });
  await checkItem({ unitId: other.id, itemId: FIRST, resetToken: 0, answer: answered('es'), result: wrong });
  let calls = 0;
  const stop = subscribeExercises(() => calls++);

  await deleteSetData('set-1');
  stop();
  expect(calls).toBe(1);
  expect(await getUnit(mine.id)).toBeUndefined();
  expect(await listItemStates(mine.id)).toEqual([]);
  expect(await listAttempts({ unitId: mine.id })).toHaveLength(1);
  expect(await failure(saveItemProgress(mine.id, FIRST, 0, {}))).toBeInstanceOf(UnitGoneError);

  expect(await getUnit(other.id)).toEqual(other);
  expect(await listItemStates(other.id)).toHaveLength(1);
});

test('accuracy per tag counts real attempts only, in taxonomy order', async () => {
  expect(await accuracyByGrammarTag()).toEqual([]);
  const unit = await seedUnit();
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('suis'), result: right });
  await checkItem({ unitId: unit.id, itemId: SECOND, resetToken: 0, answer: answeredMulti('x'), result: wrong });
  const token = await resetUnit(unit.id);
  await checkItem({ unitId: unit.id, itemId: SECOND, resetToken: token, answer: answeredMulti('x'), result: wrong });

  // Both items are tagged `present`; a third attempt on another tag shows up separately.
  const gender = { ...unitOf('GENDER_CHECK'), id: 'gender' };
  await saveUnits([gender]);
  await checkItem({
    unitId: 'gender',
    itemId: ITEMS.GENDER_CHECK.id,
    resetToken: 0,
    answer: { ...answered(''), selectedOdd: 'F' },
    result: right,
  });
  expect(await accuracyByGrammarTag()).toEqual([
    { grammarTag: 'gender-number', correct: 1, total: 1, accuracy: 1 },
    { grammarTag: 'present', correct: 1, total: 3, accuracy: 1 / 3 },
  ]);
});

test('the mistake notebook lists the latest wrong attempt per item, newest first, and marks resolved ones', async () => {
  const unit = await seedUnit();
  expect(await listMistakes()).toEqual([]);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('a'), result: wrong });
  await checkItem({ unitId: unit.id, itemId: SECOND, resetToken: 0, answer: answeredMulti('b'), result: wrong });
  let token = await resetUnit(unit.id);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: token, answer: answered('c'), result: wrong });
  token = await resetUnit(unit.id);
  await checkItem({ unitId: unit.id, itemId: SECOND, resetToken: token, answer: answeredMulti('d'), result: right });

  const mistakes = await listMistakes();
  expect(mistakes.map((m) => [m.attempt.itemId, m.attempt.userAnswer, m.resolved])).toEqual([
    [FIRST, 'c', false],
    [SECOND, 'b / b', true],
  ]);
  expect(await listMistakes(1)).toHaveLength(1);
});

test('listAttempts returns the newest first and honours the limit and filters', async () => {
  const unit = await seedUnit();
  const other = await seedUnit('set-2');
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('1'), result: wrong });
  await checkItem({ unitId: other.id, itemId: FIRST, resetToken: 0, answer: answered('2'), result: wrong });
  await checkItem({ unitId: unit.id, itemId: SECOND, resetToken: 0, answer: answeredMulti('3'), result: wrong });
  expect((await listAttempts()).map((a) => a.userAnswer)).toEqual(['3 / 3', '2', '1']);
  expect((await listAttempts({ limit: 2 })).map((a) => a.userAnswer)).toEqual(['3 / 3', '2']);
  expect((await listAttempts({ unitId: unit.id })).map((a) => a.userAnswer)).toEqual(['3 / 3', '1']);
  expect((await listAttempts({ unitId: other.id })).map((a) => a.userAnswer)).toEqual(['2']);
});

test('listeners are told after commits and not after a rejected write', async () => {
  let calls = 0;
  const stop = subscribeExercises(() => calls++);
  const unit = await seedUnit();
  expect(calls).toBe(1);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('suis'), result: right });
  expect(calls).toBe(2);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('suis'), result: right });
  expect(calls).toBe(2); // duplicate check committed nothing
  await resetUnit(unit.id);
  expect(calls).toBe(3);
  expect(await failure(saveItemProgress(unit.id, FIRST, 0, {}))).toBeInstanceOf(StaleResetError);
  expect(calls).toBe(3);
  await deleteSetData('set-1');
  expect(calls).toBe(4);
  stop();
  await deleteUnit('nothing');
  expect(calls).toBe(4);
});
