import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Article, UserStats, VocabWord } from '../types';
import type { ShadowingSentence } from '../types/shadowing';

/**
 * User data lives in IndexedDB: no 5 MB cap, async, and one record per article
 * or word. Small synchronous things (settings, API key, language) stay in
 * localStorage because they are needed before the first render.
 */

interface RelireDB extends DBSchema {
  articles: { key: string; value: Article };
  vocab: { key: string; value: VocabWord };
  meta: { key: string; value: unknown };
  /** AI answers kept to save tokens. Derivable, so never part of a backup. */
  cache: { key: string; value: CacheEntry; indexes: { kind: string } };
  /** Synthesized speech. Clips for vocabulary words are kept for good; the rest are trimmed by use. */
  audio: { key: string; value: AudioEntry; indexes: { text: string; lastUsed: number } };
  /** The learner's shadowing takes, per article sentence. User data: never trimmed, optionally backed up. */
  shadowing: { key: string; value: ShadowingSentence; indexes: { articleId: string } };
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
  kind: 'word' | 'sentence' | 'drills' | 'prosody';
  value: unknown;
  createdAt: number;
}

export interface AppData {
  articles: Article[];
  vocab: VocabWord[];
  stats: UserStats;
}

export const EMPTY_STATS: UserStats = {
  sentencesAnalyzed: 0,
  shadowingSessionsCompleted: 0,
  averagePronunciationScore: 0,
  pronunciationHistory: [],
};

let dbPromise: Promise<IDBPDatabase<RelireDB>> | null = null;

/**
 * Version-change trouble between tabs: `blocked` means another open tab keeps
 * this one from upgrading; `stale` means this tab closed its connection so a
 * newer tab could upgrade, and must be reloaded.
 */
export type DbNotice = 'blocked' | 'stale' | null;
let notice: DbNotice = null;
const noticeListeners = new Set<() => void>();
const setNotice = (next: DbNotice) => {
  notice = next;
  noticeListeners.forEach((listener) => listener());
};
export const getDbNotice = () => notice;
export function subscribeDbNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<RelireDB>('relire', 4, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('articles', { keyPath: 'id' });
          d.createObjectStore('vocab', { keyPath: 'id' });
          d.createObjectStore('meta');
        }
        if (oldVersion < 2) {
          d.createObjectStore('cache', { keyPath: 'key' }).createIndex('kind', 'kind');
        }
        if (oldVersion < 3) {
          const audio = d.createObjectStore('audio', { keyPath: 'key' });
          audio.createIndex('text', 'text');
          audio.createIndex('lastUsed', 'lastUsed');
        }
        if (oldVersion < 4) {
          d.createObjectStore('shadowing', { keyPath: 'key' }).createIndex('articleId', 'articleId');
        }
      },
      blocked() {
        setNotice('blocked');
      },
      blocking() {
        // A newer tab wants to upgrade: step aside instead of stalling it.
        void dbPromise?.then((open) => open.close());
        dbPromise = null;
        setNotice('stale');
      },
    });
    dbPromise.then(
      () => {
        if (notice === 'blocked') setNotice(null);
      },
      () => undefined,
    );
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
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

async function replaceStore(name: 'articles' | 'vocab', items: { id: string }[]) {
  const d = await db();
  const tx = d.transaction([name, 'meta'], 'readwrite');
  const store = tx.objectStore(name as 'articles');
  const keep = new Set(items.map((i) => i.id));
  for (const key of await store.getAllKeys()) {
    if (!keep.has(key)) await store.delete(key);
  }
  for (const item of items) await store.put(item as Article);
  await tx.objectStore('meta').put(true, 'started');
  await tx.done;
}

export const saveArticles = (items: Article[]) => replaceStore('articles', items);
export const saveVocab = (items: VocabWord[]) => replaceStore('vocab', items);

export async function saveStats(stats: UserStats) {
  const d = await db();
  const tx = d.transaction('meta', 'readwrite');
  await tx.store.put(stats, 'stats');
  await tx.store.put(true, 'started');
  await tx.done;
}

/** Deletes an article and its shadowing recordings together, before the UI forgets it. */
export async function deleteArticleData(articleId: string) {
  const d = await db();
  const tx = d.transaction(['articles', 'shadowing'], 'readwrite');
  const recordings = tx.objectStore('shadowing');
  for (const key of await recordings.index('articleId').getAllKeys(articleId)) await recordings.delete(key);
  await tx.objectStore('articles').delete(articleId);
  await tx.done;
}

export async function exportData(): Promise<AppData> {
  return (await loadData()) ?? { articles: [], vocab: [], stats: EMPTY_STATS };
}

/**
 * Replaces the stores present in `data` in one transaction, so a failed restore
 * changes nothing. `shadowing` undefined keeps the recordings already stored;
 * an empty array clears them. Recordings must be validated by the caller.
 */
export async function importData(data: Partial<AppData> & { shadowing?: ShadowingSentence[] }) {
  const d = await db();
  const tx = d.transaction(['articles', 'vocab', 'meta', 'shadowing'], 'readwrite');
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
  await tx.done;
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
