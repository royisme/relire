import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Article, UserStats, VocabWord } from '../types';
import type { ShadowingSentence } from '../types/shadowing';
import type { ExerciseAttempt, ExerciseItemState, ExerciseUnit } from '../types/exercises';
import { exercisesChanged } from './exerciseEvents';
import { parseExerciseBackup, restoreExerciseRows } from './exerciseBackup';
import { deleteUnitRows } from './exerciseRows';

/**
 * User data lives in IndexedDB: no 5 MB cap, async, and one record per article
 * or word. Small synchronous things (settings, API key, language) stay in
 * localStorage because they are needed before the first render.
 */

export interface RelireDB extends DBSchema {
  articles: { key: string; value: Article };
  vocab: { key: string; value: VocabWord };
  meta: { key: string; value: unknown };
  /** AI answers kept to save tokens. Derivable, so never part of a backup. */
  cache: { key: string; value: CacheEntry; indexes: { kind: string } };
  /** Synthesized speech. Clips for vocabulary words are kept for good; the rest are trimmed by use. */
  audio: { key: string; value: AudioEntry; indexes: { text: string; lastUsed: number } };
  /** The learner's shadowing takes, per article or unit-passage sentence. User data: never trimmed, optionally backed up. */
  shadowing: { key: string; value: ShadowingSentence; indexes: { articleId: string; unitId: string } };
  /** Self-contained exercise units, grouped by the batch (`setId`) they were saved with. Owned by `exercises.ts`. */
  units: { key: string; value: ExerciseUnit; indexes: { setId: string } };
  /** The learner's current answer per item (`unitId:itemId`). Cleared by a unit reset. */
  itemStates: { key: string; value: ExerciseItemState; indexes: { unitId: string } };
  /** One row per check, with its own prompt and answer text. Survives resets and unit and set deletes. */
  attempts: {
    key: string;
    value: ExerciseAttempt;
    indexes: { unitId: string; grammarTag: string; timestamp: number };
  };
}

export interface AudioEntry {
  key: string;
  text: string; // normalized
  provider: string;
  voice: string;
  model: string;
  blob: Blob;
  bytes: number;
  lastUsed: number;
}

export interface CacheEntry {
  key: string;
  kind: 'word' | 'sentence' | 'prosody' | 'hint' | 'explanation' | 'exercises';
  value: unknown;
  createdAt: number;
}

export interface AppData {
  articles: Article[];
  vocab: VocabWord[];
  stats: UserStats;
}

/** Everything a backup carries from IndexedDB: the app data plus the exercise stores. */
export interface BackupData extends AppData {
  units: ExerciseUnit[];
  itemStates: ExerciseItemState[];
  attempts: ExerciseAttempt[];
}

export const EMPTY_STATS: UserStats = {
  sentencesAnalyzed: 0,
  shadowingSessionsCompleted: 0,
  averagePronunciationScore: 0,
  pronunciationHistory: [],
};

let dbPromise: Promise<IDBPDatabase<RelireDB>> | null = null;

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<RelireDB>('relire', 1, {
      upgrade(d) {
        d.createObjectStore('articles', { keyPath: 'id' });
        d.createObjectStore('vocab', { keyPath: 'id' });
        d.createObjectStore('meta');
        d.createObjectStore('cache', { keyPath: 'key' }).createIndex('kind', 'kind');
        const audio = d.createObjectStore('audio', { keyPath: 'key' });
        audio.createIndex('text', 'text');
        audio.createIndex('lastUsed', 'lastUsed');
        const shadowing = d.createObjectStore('shadowing', { keyPath: 'key' });
        shadowing.createIndex('articleId', 'articleId');
        shadowing.createIndex('unitId', 'passage.unitId');
        d.createObjectStore('units', { keyPath: 'id' }).createIndex('setId', 'setId');
        d.createObjectStore('itemStates', { keyPath: 'id' }).createIndex('unitId', 'unitId');
        const attempts = d.createObjectStore('attempts', { keyPath: 'id' });
        attempts.createIndex('unitId', 'unitId');
        attempts.createIndex('grammarTag', 'grammarTag');
        attempts.createIndex('timestamp', 'timestamp');
      },
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Closes the connection so the next `db()` call opens a fresh one (tests, after deleting the database). */
export async function closeDb() {
  const open = dbPromise;
  dbPromise = null;
  (await open?.catch(() => undefined))?.close();
}

/** Returns null on the very first run, before anything has been saved. */
export async function loadData(): Promise<AppData | null> {
  const d = await db();
  const started = await d.get('meta', 'started');
  if (!started) return null;
  const [articles, vocab, stats] = await Promise.all([
    d.getAll('articles'),
    d.getAll('vocab'),
    d.get('meta', 'stats') as Promise<UserStats | undefined>,
  ]);
  articles.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return { articles, vocab, stats: { ...EMPTY_STATS, ...stats } };
}

/** Seeds only a never-started library; the marker and samples commit together. */
export async function initializeData(initialArticles: Article[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(['articles', 'meta'], 'readwrite');
  try {
    if (!(await tx.objectStore('meta').get('started'))) {
      for (const article of initialArticles) await tx.objectStore('articles').put(article);
      await tx.objectStore('meta').put(true, 'started');
    }
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
  await tx.done;
}

/** An explicit save owns this row, never the caller's library snapshot. */
export async function saveArticle(article: Article): Promise<void> {
  const d = await db();
  const tx = d.transaction(['articles', 'meta'], 'readwrite');
  try {
    await tx.objectStore('articles').put(article);
    await tx.objectStore('meta').put(true, 'started');
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
  await tx.done;
}

/** Restoring bundled samples must keep any version already stored by another tab. */
export async function restoreMissingArticles(candidates: Article[]): Promise<Article[]> {
  const d = await db();
  const tx = d.transaction(['articles', 'meta'], 'readwrite');
  const restored: Article[] = [];
  try {
    const store = tx.objectStore('articles');
    for (const candidate of candidates) {
      const stored = await store.get(candidate.id);
      if (!stored) await store.put(candidate);
      restored.push(stored ?? candidate);
    }
    await tx.objectStore('meta').put(true, 'started');
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
  await tx.done;
  return restored;
}

export async function saveVocab(items: VocabWord[]) {
  const d = await db();
  const tx = d.transaction(['vocab', 'meta'], 'readwrite');
  const store = tx.objectStore('vocab');
  const keep = new Set(items.map((i) => i.id));
  for (const key of await store.getAllKeys()) {
    if (!keep.has(key)) await store.delete(key);
  }
  for (const item of items) await store.put(item);
  await tx.objectStore('meta').put(true, 'started');
  await tx.done;
}

export async function saveStats(stats: UserStats) {
  const d = await db();
  const tx = d.transaction('meta', 'readwrite');
  await tx.store.put(stats, 'stats');
  await tx.store.put(true, 'started');
  await tx.done;
}

/**
 * Deletes an article with its shadowing recordings in one transaction, before the UI forgets it.
 * Exercise units never point at an article, so they are untouched.
 */
export async function deleteArticleData(articleId: string) {
  const d = await db();
  const tx = d.transaction(['articles', 'shadowing'], 'readwrite');
  const recordings = tx.objectStore('shadowing');
  for (const key of await recordings.index('articleId').getAllKeys(articleId)) await recordings.delete(key);
  await tx.objectStore('articles').delete(articleId);
  await tx.done;
}

/**
 * Deletes a whole batch: its units, their item states and the shadowing recordings of their
 * passages, in one transaction. Attempts stay: they carry their own prompt and answer text.
 */
export async function deleteSetData(setId: string) {
  const d = await db();
  const tx = d.transaction(['units', 'itemStates', 'meta', 'shadowing'], 'readwrite');
  const recordings = tx.objectStore('shadowing');
  const stores = {
    units: tx.objectStore('units'),
    itemStates: tx.objectStore('itemStates'),
    meta: tx.objectStore('meta'),
  };
  const unitIds = await stores.units.index('setId').getAllKeys(setId);
  for (const unitId of unitIds) {
    for (const key of await recordings.index('unitId').getAllKeys(unitId)) await recordings.delete(key);
    await deleteUnitRows(stores, unitId);
  }
  await tx.done;
  if (unitIds.length) exercisesChanged();
}

/** App data plus the exercise stores, read as one snapshot of the exercise stores. API keys are never in IndexedDB. */
export async function exportData(): Promise<BackupData> {
  const d = await db();
  const tx = d.transaction(['units', 'itemStates', 'attempts'], 'readonly');
  const [units, itemStates, attempts] = await Promise.all([
    tx.objectStore('units').getAll(),
    tx.objectStore('itemStates').getAll(),
    tx.objectStore('attempts').getAll(),
  ]);
  const app = (await loadData()) ?? { articles: [], vocab: [], stats: EMPTY_STATS };
  return { ...app, units, itemStates, attempts };
}

/** What a backup file may hand to `importData`. The exercise keys are unvalidated JSON here. */
export interface RestoreInput extends Partial<AppData> {
  /** Validated by the caller (`parseShadowingBackup`). */
  shadowing?: ShadowingSentence[];
  units?: unknown;
  itemStates?: unknown;
  attempts?: unknown;
}

/**
 * Replaces the stores present in `data` in one transaction, so a failed restore
 * changes nothing. `shadowing` undefined keeps the recordings already stored;
 * an empty array clears them. Recordings must be validated by the caller.
 * The exercise keys (`units`, `itemStates`, `attempts`) are validated here, in
 * full, before the transaction opens: a malformed payload throws
 * `ExerciseBackupError` and nothing is written; an absent key keeps the stored rows.
 */
export async function importData(data: RestoreInput) {
  const exercises = parseExerciseBackup(data);
  const touchesExercises = Boolean(exercises.units || exercises.itemStates || exercises.attempts);
  const d = await db();
  const tx = d.transaction(['articles', 'vocab', 'meta', 'shadowing', 'units', 'itemStates', 'attempts'], 'readwrite');
  if (data.articles) {
    const store = tx.objectStore('articles');
    await store.clear();
    for (const article of data.articles) await store.put(article);
  }
  if (data.vocab) {
    const store = tx.objectStore('vocab');
    await store.clear();
    for (const word of data.vocab) await store.put(word);
  }
  if (data.shadowing) {
    const store = tx.objectStore('shadowing');
    await store.clear();
    for (const sentence of data.shadowing) await store.put(sentence);
  }
  if (data.stats) await tx.objectStore('meta').put({ ...EMPTY_STATS, ...data.stats }, 'stats');
  await tx.objectStore('meta').put(true, 'started');
  if (touchesExercises) {
    try {
      await restoreExerciseRows(
        {
          units: tx.objectStore('units'),
          itemStates: tx.objectStore('itemStates'),
          attempts: tx.objectStore('attempts'),
          meta: tx.objectStore('meta'),
        },
        exercises,
      );
    } catch (err) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw err;
    }
  }
  await tx.done;
  if (touchesExercises) exercisesChanged();
}

export interface StorageInfo {
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = {};
  try {
    const est = await navigator.storage?.estimate?.();
    info.usage = est?.usage;
    info.quota = est?.quota;
    info.persisted = await navigator.storage?.persisted?.();
  } catch {
    // Not available in this browser.
  }
  return info;
}

/** Asks the browser not to clear this site's data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
