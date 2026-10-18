/**
 * Low-level row operations on the exercise stores that more than one module
 * needs inside a transaction: the per-unit reset token and removing a unit's
 * rows. `exercises.ts` (public API), `db.ts` (set cascade) and
 * `exerciseBackup.ts` (restore) all go through here, so the token rule lives
 * in one place. Opens no transactions of its own and notifies no one.
 *
 * Reset token: a per-unit counter kept in `meta` under `exerciseReset:<unitId>`
 * (absent = 0). Anything that invalidates work in flight for a unit (reset,
 * delete, set delete, restore) increments it in the same transaction as the
 * change. A writer reads the token before it starts slow work (an AI grade, a
 * hint) and passes it back; the write is rejected when the token has moved.
 * Tokens are bumped, never removed, so a deleted-then-recreated unit id cannot
 * match an old writer's token again.
 */
import type { IDBPObjectStore, StoreNames } from 'idb';
import type { RelireDB } from './db';

export type RwStore<N extends StoreNames<RelireDB>> = IDBPObjectStore<
  RelireDB,
  ArrayLike<StoreNames<RelireDB>>,
  N,
  'readwrite'
>;

export const resetTokenKey = (unitId: string) => `exerciseReset:${unitId}`;

/** The current token for a unit; 0 until the unit was first reset, deleted or restored over. */
export async function readResetToken(meta: { get(key: string): Promise<unknown> }, unitId: string): Promise<number> {
  const value = await meta.get(resetTokenKey(unitId));
  return typeof value === 'number' ? value : 0;
}

/** Invalidates every writer holding an older token for this unit. Returns the new token. */
export async function bumpResetToken(meta: RwStore<'meta'>, unitId: string): Promise<number> {
  const next = (await readResetToken(meta, unitId)) + 1;
  await meta.put(next, resetTokenKey(unitId));
  return next;
}

/** Deletes a unit's current item states and invalidates its writers. Attempts are not touched. */
export async function clearUnitStates(
  stores: { itemStates: RwStore<'itemStates'>; meta: RwStore<'meta'> },
  unitId: string,
): Promise<number> {
  for (const key of await stores.itemStates.index('unitId').getAllKeys(unitId)) await stores.itemStates.delete(key);
  return bumpResetToken(stores.meta, unitId);
}

/** Deletes a unit with its item states and invalidates its writers. Attempts stay: they carry their own text. */
export async function deleteUnitRows(
  stores: { units: RwStore<'units'>; itemStates: RwStore<'itemStates'>; meta: RwStore<'meta'> },
  unitId: string,
): Promise<void> {
  await clearUnitStates(stores, unitId);
  await stores.units.delete(unitId);
}
