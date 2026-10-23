/** A sheet reads its unit, answers and reset token together, including when a reset is queued. */
import { beforeEach, expect, test } from 'bun:test';
import { answered, freshDb, seedUnit } from './fixtures/storage';
import { getUnitSnapshot, resetUnit, saveItemProgress } from '../src/storage/exercises';

beforeEach(freshDb);

test('getUnitSnapshot returns a missing unit without inventing item states', async () => {
  expect(await getUnitSnapshot('missing')).toEqual({ unit: undefined, states: [], resetToken: 0 });
});

test('getUnitSnapshot never pairs pre-reset answers with a post-reset token', async () => {
  const unit = await seedUnit();
  const state = await saveItemProgress(unit.id, unit.items[0].id, 0, { answer: answered('suis') });
  const before = getUnitSnapshot(unit.id);
  const reset = resetUnit(unit.id);
  const after = getUnitSnapshot(unit.id);

  expect(await before).toEqual({ unit, states: [state], resetToken: 0 });
  const next = await reset;
  expect(await after).toEqual({ unit, states: [], resetToken: next });
});
