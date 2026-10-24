/** Owns immutable reader staging, exact readback, publication markers and the final catalogue pointer switch. */
import { createHash } from 'node:crypto';
import { canonicalVocabularyJson, vocabularyHash } from '../../src/services/vocabulary/book';
import {
  readerSummary,
  validatePublishedReader,
  validateReaderCatalogue,
} from '../../src/services/gradedReaders/catalogue';
import type { PublishedReader } from '../../src/types/gradedReader';
import { assertPublicReader } from './assemble';

export interface ReaderPublishAdapter {
  execute(sql: string, parameters?: (string | number)[]): Promise<void>;
  read(sql: string): Promise<Record<string, unknown>[]>;
}
export const sqlQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const artifactHash = (body: string) => createHash('sha256').update(body).digest('hex');

export async function prepareReaderPublication(readers: PublishedReader[], syllabusVersion: string) {
  const artifacts = [];
  for (const raw of readers) {
    const reader = await validatePublishedReader(assertPublicReader(raw));
    const body = canonicalVocabularyJson(reader);
    artifacts.push({ reader, body, hash: artifactHash(body) });
  }
  const body = { schemaVersion: 1 as const, syllabusVersion, readers: await Promise.all(readers.map(readerSummary)) };
  const catalogue = await validateReaderCatalogue({ ...body, version: await vocabularyHash(body) });
  return { artifacts, catalogue };
}

export async function publishReaders(
  prepared: Awaited<ReturnType<typeof prepareReaderPublication>>,
  db: ReaderPublishAdapter,
) {
  const { artifacts, catalogue } = prepared;
  // An empty remote selection must not clear an already published catalogue.
  if (!artifacts.length) return;
  for (const { reader, body, hash } of artifacts) {
    const where = `id = ${sqlQuote(reader.body.id)} AND artifact_hash = ${sqlQuote(hash)}`;
    const [existing] = await db.read(`SELECT body, body_version, stage_order FROM readers WHERE ${where};`);
    if (
      existing &&
      (existing.body !== body || existing.body_version !== reader.version || existing.stage_order !== reader.body.order)
    )
      throw new Error('Immutable reader collision');
    await db.execute(
      'INSERT OR IGNORE INTO readers (id, artifact_hash, body_version, stage_order, body) VALUES (?, ?, ?, ?, ?);',
      [reader.body.id, hash, reader.version, reader.body.order, body],
    );
  }
  // Verify every staged artifact before publishing even the first marker.
  for (const { reader, body, hash } of artifacts) {
    const rows = await db.read(
      `SELECT body, body_version, stage_order FROM readers WHERE id = ${sqlQuote(reader.body.id)} AND artifact_hash = ${sqlQuote(hash)};`,
    );
    const stored = rows[0];
    if (
      rows.length !== 1 ||
      stored.body !== body ||
      stored.body_version !== reader.version ||
      stored.stage_order !== reader.body.order ||
      artifactHash(stored.body as string) !== hash
    )
      throw new Error('Reader stage readback mismatch');
    await validatePublishedReader(JSON.parse(stored.body as string));
  }
  const immutableMeta = async (key: string, value: string) => {
    const query = `SELECT value FROM meta WHERE key = ${sqlQuote(key)};`;
    const [prior] = await db.read(query);
    if (prior && prior.value !== value) throw new Error('Immutable reader metadata collision');
    await db.execute('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?);', [key, value]);
    const [stored] = await db.read(query);
    if (stored?.value !== value) throw new Error('Reader metadata readback mismatch');
  };
  for (const { reader, hash } of artifacts)
    await immutableMeta(
      `readerPublished:${reader.body.id}:${hash}`,
      canonicalVocabularyJson({ bodyVersion: reader.version, artifactHash: hash }),
    );
  await immutableMeta(`readersCatalog:${catalogue.version}`, canonicalVocabularyJson(catalogue));
  await db.execute(
    "INSERT INTO meta (key, value) VALUES ('readersCurrent', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
    [catalogue.version],
  );
  const [current] = await db.read("SELECT value FROM meta WHERE key = 'readersCurrent';");
  if (current?.value !== catalogue.version) throw new Error('Reader current pointer readback mismatch');
}
