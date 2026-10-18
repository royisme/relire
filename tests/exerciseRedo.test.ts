/**
 * Redoing one item: the storage row is cleared while its attempts stay, the
 * unit's other rows and its reset token are untouched, and the autosave that was
 * already queued for that item cannot write the old answer back.
 */
import { beforeEach, expect, test } from 'bun:test';
import { answered, freshDb, right, seedUnit, wrong } from './fixtures/storage';
import { ITEMS } from './fixtures/units';
import {
  checkItem,
  clearItemState,
  getItemState,
  getResetToken,
  listAttempts,
  listItemStates,
  listMistakes,
  saveItemProgress,
} from '../src/storage/exercises';
import { dropDraft, queueDraft, type DraftMap } from '../src/hooks/exerciseUnit/drafts';

beforeEach(freshDb);

const FIRST = ITEMS.FILL_BLANKS.id;
const SECOND = ITEMS.FILL_BLANKS_MULTI.id;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('clearing one item removes its state only, keeping its attempts and the other rows', async () => {
  const unit = await seedUnit();
  const token = await getResetToken(unit.id);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: token, answer: answered('suis'), result: wrong });
  await saveItemProgress(unit.id, SECOND, token, { answer: { ...answered('es'), multiAnswers: ['es', 'est'] } });

  expect(await clearItemState(unit.id, FIRST)).toBe(true);
  expect(await getItemState(unit.id, FIRST)).toBeUndefined();
  expect(await getItemState(unit.id, SECOND)).toBeDefined();
  // Attempts are history, so the mistake stays and only a later correct attempt resolves it.
  expect(await listAttempts()).toHaveLength(1);
  expect((await listMistakes()).map((entry) => entry.resolved)).toEqual([false]);
  // The token did not move: work in flight for other items is still the current work.
  expect(await getResetToken(unit.id)).toBe(token);
  expect(await clearItemState(unit.id, FIRST)).toBe(false);
});

test('a queued autosave would write the cleared answer back if the redo did not drop it', async () => {
  const unit = await seedUnit();
  const token = await getResetToken(unit.id);
  const drafts: DraftMap = new Map();
  const write = (itemId: string) => {
    void saveItemProgress(unit.id, itemId, token, { answer: answered('suis') });
  };
  queueDraft(drafts, FIRST, { answer: answered('suis'), token }, 5, write);
  await clearItemState(unit.id, FIRST);
  await wait(30);
  expect(await getItemState(unit.id, FIRST)).toBeDefined();
});

test('the redo drops that item’s autosave and leaves the other item’s alone', async () => {
  const unit = await seedUnit();
  const token = await getResetToken(unit.id);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: token, answer: answered('suis'), result: wrong });
  const drafts: DraftMap = new Map();
  const writes: string[] = [];
  const write = (itemId: string) => {
    writes.push(itemId);
    void saveItemProgress(unit.id, itemId, token, {
      answer: itemId === FIRST ? answered('suis') : { ...answered('es'), multiAnswers: ['es', 'est'] },
    });
  };
  // Both rows have an autosave waiting when the learner redoes the first one.
  queueDraft(drafts, FIRST, { answer: answered('suis'), token }, 5, write);
  queueDraft(drafts, SECOND, { answer: answered('es'), token }, 5, write);
  dropDraft(drafts, FIRST);
  await clearItemState(unit.id, FIRST);
  await wait(30);

  expect(writes).toEqual([SECOND]);
  expect(await getItemState(unit.id, FIRST)).toBeUndefined();
  expect((await listItemStates(unit.id)).map((state) => state.itemId)).toEqual([SECOND]);
  expect(await listAttempts()).toHaveLength(1);
});

test('a later correct attempt resolves the mistake the cleared item left behind', async () => {
  const unit = await seedUnit();
  const token = await getResetToken(unit.id);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: token, answer: answered('suis'), result: wrong });
  await clearItemState(unit.id, FIRST);
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: token, answer: answered('suis'), result: right });
  expect((await listMistakes()).map((entry) => entry.resolved)).toEqual([true]);
  expect(await listAttempts()).toHaveLength(2);
});
