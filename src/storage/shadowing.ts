/**
 * The learner's shadowing takes: one bounded record per source sentence,
 * first in first out past MAX_TAKES. Owns the `shadowing` store, its backup
 * format and validation; never trimmed like synthesized audio.
 */
import { base64ToBlob, blobToBase64 } from '../utils/binary';
import { MAX_TAKES, type ShadowingSentence, type ShadowingTake } from '../types/shadowing';
import { normalizeText } from './audio';
import { db, requestPersistence } from './db';
import type { RecordableReaderSource as ReaderSource } from '../types/readerSource';
import { splitArticle } from '../utils/sentences';

export const shadowingKey = (articleId: string, text: string) => `${articleId}|${normalizeText(text)}`;

export const sourceOfRecording = (record: ShadowingSentence): ReaderSource =>
  record.passage
    ? { kind: 'passage', unitId: record.passage.unitId }
    : { kind: 'article', articleId: record.articleId };
export const sourceSentenceKey = (source: ReaderSource, text: string) =>
  source.kind === 'article'
    ? shadowingKey(source.articleId, text)
    : `passage:${encodeURIComponent(JSON.stringify([source.unitId, normalizeText(text)]))}`;

/** The article or passage is no longer the source of a take being saved. The name predates passage sources and is kept. */
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

/**
 * Appends a take, dropping the oldest past MAX_TAKES, in one transaction. Resolves after commit.
 * Reader captures pass their exact passage content so an edit cannot accept a stopped late take.
 */
export async function addTake(
  source: string | ReaderSource,
  text: string,
  take: { blob: Blob; mimeType: string; durationMs: number; recordedAt?: number },
  expectedPassage?: string,
): Promise<ShadowingSentence> {
  const d = await db();
  const owner: ReaderSource = typeof source === 'string' ? { kind: 'article', articleId: source } : source;
  const tx = d.transaction(['articles', 'units', 'shadowing'], 'readwrite');
  let record: ShadowingSentence;
  try {
    // Checked inside the transaction: a source deleted meanwhile gets no orphan take.
    if (owner.kind === 'article') {
      if (!(await tx.objectStore('articles').getKey(owner.articleId))) throw new ArticleGoneError();
    } else {
      const unit = await tx.objectStore('units').get(owner.unitId);
      const content = unit?.readingPassage?.content;
      if (
        !content?.trim() ||
        (expectedPassage !== undefined && expectedPassage !== content) ||
        !splitArticle(content)
          .flat()
          .some((s) => normalizeText(s.text) === normalizeText(text))
      ) {
        throw new ArticleGoneError();
      }
    }
    const store = tx.objectStore('shadowing');
    const key = sourceSentenceKey(owner, text);
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
    record = {
      key,
      ...(owner.kind === 'article' ? { articleId: owner.articleId } : { passage: { unitId: owner.unitId } }),
      text: text.trim(),
      updatedAt: entry.recordedAt,
      takes,
    };
    await store.put(record);
    await tx.done;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      /* The transaction may already have aborted. */
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
  changed();
  if (!persistenceAsked) {
    persistenceAsked = true;
    void requestPersistence();
  }
  return record;
}

export async function getShadowingSentence(
  source: string | ReaderSource,
  text: string,
): Promise<ShadowingSentence | undefined> {
  return (await db()).get(
    'shadowing',
    sourceSentenceKey(typeof source === 'string' ? { kind: 'article', articleId: source } : source, text),
  );
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
    if (takes.length)
      await tx.store.put({ ...record, takes, updatedAt: Math.max(...takes.map((take) => take.recordedAt)) });
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

/** Exactly one of `articleId` and `passage` is present. */
export interface ShadowingBackup {
  articleId?: string;
  passage?: { unitId: string };
  text: string;
  takes: TakeBackup[];
}

export async function exportShadowing(): Promise<ShadowingBackup[]> {
  const out: ShadowingBackup[] = [];
  for (const record of await listShadowing()) {
    const takes: TakeBackup[] = [];
    for (const take of record.takes) {
      takes.push({
        id: take.id,
        recordedAt: take.recordedAt,
        mimeType: take.mimeType,
        durationMs: take.durationMs,
        data: await blobToBase64(take.blob),
      });
    }
    out.push({
      ...(record.passage ? { passage: record.passage } : { articleId: record.articleId }),
      text: record.text,
      takes,
    });
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

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
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
    if (!isText(item.text, 4000)) throw new ShadowingBackupError(`${where}: text missing`);
    if ((item.articleId === undefined) === (item.passage === undefined))
      throw new ShadowingBackupError(`${where}: exactly one of article and passage expected`);
    if (!Array.isArray(item.takes) || item.takes.length === 0 || item.takes.length > MAX_TAKES)
      throw new ShadowingBackupError(`${where}: 1 to ${MAX_TAKES} takes expected`);
    if (item.articleId !== undefined && !isText(item.articleId, 200))
      throw new ShadowingBackupError(`${where}: article missing`);
    if (
      item.passage !== undefined &&
      (!item.passage ||
        typeof item.passage !== 'object' ||
        !isText(item.passage.unitId, 200) ||
        Object.keys(item.passage).some((key) => key !== 'unitId'))
    )
      throw new ShadowingBackupError(`${where}: malformed passage provenance`);
    const source: ReaderSource = item.passage
      ? { kind: 'passage', unitId: item.passage.unitId }
      : { kind: 'article', articleId: item.articleId as string };
    const key = sourceSentenceKey(source, item.text);
    if (records.has(key)) throw new ShadowingBackupError(`${where}: duplicate sentence`);
    const takes = item.takes
      .map((take, at): ShadowingTake => {
        const there = `${where}.takes[${at}]`;
        if (!take || typeof take !== 'object') throw new ShadowingBackupError(`${there}: not an object`);
        if (!isText(take.id, 100) || ids.has(take.id))
          throw new ShadowingBackupError(`${there}: missing or duplicate id`);
        if (!isTime(take.recordedAt) || !isTime(take.durationMs)) throw new ShadowingBackupError(`${there}: bad time`);
        if (!isText(take.mimeType, 100) || !take.mimeType.startsWith('audio/'))
          throw new ShadowingBackupError(`${there}: not audio`);
        if (typeof take.data !== 'string' || !take.data) throw new ShadowingBackupError(`${there}: no audio data`);
        let blob: Blob;
        try {
          blob = base64ToBlob(take.data, take.mimeType);
        } catch {
          throw new ShadowingBackupError(`${there}: audio data is not base64`);
        }
        ids.add(take.id);
        return {
          id: take.id,
          recordedAt: take.recordedAt,
          mimeType: take.mimeType,
          durationMs: take.durationMs,
          bytes: blob.size,
          blob,
        };
      })
      .sort((a, b) => a.recordedAt - b.recordedAt);
    records.set(key, {
      key,
      ...(source.kind === 'article' ? { articleId: source.articleId } : { passage: { unitId: source.unitId } }),
      text: item.text.trim(),
      updatedAt: takes[takes.length - 1].recordedAt,
      takes,
    });
  });
  return [...records.values()];
}
