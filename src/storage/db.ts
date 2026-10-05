import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Article, UserStats, VocabWord } from '../types';

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
  kind: 'word' | 'sentence' | 'drills';
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

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<RelireDB>('relire', 3, {
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
      },
    });
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

export async function exportData(): Promise<AppData> {
  return (await loadData()) ?? { articles: [], vocab: [], stats: EMPTY_STATS };
}

/** Replaces everything stored with the given data. */
export async function importData(data: Partial<AppData>) {
  if (data.articles) await saveArticles(data.articles);
  if (data.vocab) await saveVocab(data.vocab);
  if (data.stats) await saveStats({ ...EMPTY_STATS, ...data.stats });
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
