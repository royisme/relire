/**
 * The learner's shadowing takes: one bounded record per article sentence,
 * first in first out past MAX_TAKES. Owns the `shadowing` store, its backup
 * format and validation; never trimmed like synthesized audio.
 */
import { base64ToBlob, blobToBase64 } from '../utils/binary';
import { MAX_TAKES, type ShadowingSentence, type ShadowingTake } from '../types/shadowing';
import { normalizeText } from './audio';
import { db, requestPersistence } from './db';

export const shadowingKey = (articleId: string, text: string) => `${articleId}|${normalizeText(text)}`;

/** The article was deleted while a take was being saved. */
export class ArticleGoneError extends Error {
  constructor() {
    super('Article deleted');
    this.name = 'ArticleGoneError';
  }
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
export function subscribeShadowing(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let persistenceAsked = false;

/** Appends a take, dropping the oldest past MAX_TAKES, in one transaction. Resolves after commit. */
export async function addTake(
  articleId: string,
  text: string,
  take: { blob: Blob; mimeType: string; durationMs: number; recordedAt?: number },
): Promise<ShadowingSentence> {
  const d = await db();
  const tx = d.transaction(['articles', 'shadowing'], 'readwrite');
  // Checked inside the transaction: an article deleted meanwhile gets no orphan take.
  if (!(await tx.objectStore('articles').getKey(articleId))) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new ArticleGoneError();
  }
  const store = tx.objectStore('shadowing');
  const key = shadowingKey(articleId, text);
  const existing = await store.get(key);
  const entry: ShadowingTake = {
    id: crypto.randomUUID(),
    recordedAt: take.recordedAt ?? Date.now(),
    mimeType: take.mimeType,
    durationMs: take.durationMs,
    bytes: take.blob.size,
    blob: take.blob,
  };
  const takes = [...(existing?.takes ?? []), entry].slice(-MAX_TAKES);
  const record: ShadowingSentence = { key, articleId, text: text.trim(), updatedAt: entry.recordedAt, takes };
  await store.put(record);
  await tx.done;
  changed();
  if (!persistenceAsked) {
    persistenceAsked = true;
    void requestPersistence();
  }
  return record;
}

export async function getShadowingSentence(articleId: string, text: string): Promise<ShadowingSentence | undefined> {
  return (await db()).get('shadowing', shadowingKey(articleId, text));
}

/** All records, or one article's. Values include their blobs (IndexedDB returns whole records). */
export async function listShadowing(articleId?: string): Promise<ShadowingSentence[]> {
  const d = await db();
  return articleId ? d.getAllFromIndex('shadowing', 'articleId', articleId) : d.getAll('shadowing');
}

/** Removes one take; the record goes when its last take does. */
export async function deleteTake(key: string, takeId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction('shadowing', 'readwrite');
  const record = await tx.store.get(key);
  if (record) {
    const takes = record.takes.filter((take) => take.id !== takeId);
    if (takes.length) await tx.store.put({ ...record, takes, updatedAt: Math.max(...takes.map((take) => take.recordedAt)) });
    else await tx.store.delete(key);
  }
  await tx.done;
  changed();
}

export async function deleteShadowingSentence(key: string): Promise<void> {
  await (await db()).delete('shadowing', key);
  changed();
}

export async function clearShadowing(): Promise<void> {
  await (await db()).clear('shadowing');
  changed();
}

export interface ShadowingStats {
  sentences: number;
  takes: number;
  bytes: number;
}

export async function shadowingStats(): Promise<ShadowingStats> {
  const stats: ShadowingStats = { sentences: 0, takes: 0, bytes: 0 };
  for (const record of await listShadowing()) {
    stats.sentences++;
    stats.takes += record.takes.length;
    stats.bytes += record.takes.reduce((sum, take) => sum + take.bytes, 0);
  }
  return stats;
}

/** Notifies listeners after a restore replaced the store. */
export const shadowingRestored = changed;

interface TakeBackup {
  id: string;
  recordedAt: number;
  mimeType: string;
  durationMs: number;
  data: string; // base64
}

export interface ShadowingBackup {
  articleId: string;
  text: string;
  takes: TakeBackup[];
}

export async function exportShadowing(): Promise<ShadowingBackup[]> {
  const out: ShadowingBackup[] = [];
  for (const record of await listShadowing()) {
    const takes: TakeBackup[] = [];
    for (const take of record.takes) {
      takes.push({ id: take.id, recordedAt: take.recordedAt, mimeType: take.mimeType, durationMs: take.durationMs, data: await blobToBase64(take.blob) });
    }
    out.push({ articleId: record.articleId, text: record.text, takes });
  }
  return out;
}

/** A backup's recordings are malformed; the whole restore is refused. */
export class ShadowingBackupError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ShadowingBackupError';
  }
}

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Validates and decodes everything before anything is written. */
export function parseShadowingBackup(value: unknown): ShadowingSentence[] {
  if (!Array.isArray(value)) throw new ShadowingBackupError('recordings: not a list');
  const records = new Map<string, ShadowingSentence>();
  const ids = new Set<string>();
  value.forEach((raw, index) => {
    const where = `recordings[${index}]`;
    const item = raw as Partial<ShadowingBackup> | null;
    if (!item || typeof item !== 'object') throw new ShadowingBackupError(`${where}: not an object`);
    if (!isText(item.articleId, 200) || !isText(item.text, 4000)) throw new ShadowingBackupError(`${where}: article or text missing`);
    if (!Array.isArray(item.takes) || item.takes.length === 0 || item.takes.length > MAX_TAKES) throw new ShadowingBackupError(`${where}: 1 to ${MAX_TAKES} takes expected`);
    const key = shadowingKey(item.articleId, item.text);
    if (records.has(key)) throw new ShadowingBackupError(`${where}: duplicate sentence`);
    const takes = item.takes.map((take, at): ShadowingTake => {
      const there = `${where}.takes[${at}]`;
      if (!take || typeof take !== 'object') throw new ShadowingBackupError(`${there}: not an object`);
      if (!isText(take.id, 100) || ids.has(take.id)) throw new ShadowingBackupError(`${there}: missing or duplicate id`);
      if (!isTime(take.recordedAt) || !isTime(take.durationMs)) throw new ShadowingBackupError(`${there}: bad time`);
      if (!isText(take.mimeType, 100) || !take.mimeType.startsWith('audio/')) throw new ShadowingBackupError(`${there}: not audio`);
      if (typeof take.data !== 'string' || !take.data) throw new ShadowingBackupError(`${there}: no audio data`);
      let blob: Blob;
      try {
        blob = base64ToBlob(take.data, take.mimeType);
      } catch {
        throw new ShadowingBackupError(`${there}: audio data is not base64`);
      }
      ids.add(take.id);
      return { id: take.id, recordedAt: take.recordedAt, mimeType: take.mimeType, durationMs: take.durationMs, bytes: blob.size, blob };
    }).sort((a, b) => a.recordedAt - b.recordedAt);
    records.set(key, { key, articleId: item.articleId, text: item.text.trim(), updatedAt: takes[takes.length - 1].recordedAt, takes });
  });
  return [...records.values()];
}
