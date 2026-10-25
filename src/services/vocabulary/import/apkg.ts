/** Read content only, then close SQLite. Scheduling and numbered media entries never enter the import. */
import { unzipSync } from 'fflate';
import { t } from 'i18next';
import { z } from 'zod';
import type { Database, SqlJsStatic } from 'sql.js';
import type { PlainTextImport } from './plainText';
import { loadImportSql } from './sqlLoader';
import { errorMessage } from '../../ai/errors';
import { ImportRefusal } from './refusal';

export const MAX_APKG_BYTES = 50 * 1024 * 1024;
export const MAX_DATABASE_BYTES = 200 * 1024 * 1024;
const collections = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];

export interface ApkgNoteType {
  id: number;
  name: string;
  fieldNames: string[];
  noteCount: number;
  parsed: PlainTextImport;
}

export function checkApkgSize(size: number): void {
  if (size > MAX_APKG_BYTES) throw new Error(t('vocab.import.apkg.tooLarge', { size: 50 }));
}

export async function readApkgFile(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<ApkgNoteType[]> {
  checkApkgSize(file.size);
  return readApkg(new Uint8Array(await file.arrayBuffer()));
}

export async function readApkg(bytes: Uint8Array): Promise<ApkgNoteType[]> {
  checkApkgSize(bytes.byteLength);
  const collection = unzipCollection(bytes);
  if (!collection) throw new Error(t('vocab.import.apkg.noCollection'));
  const data = collection.name === 'collection.anki21b' ? await decodeCollection(collection.bytes) : collection.bytes;
  const sql = await loadImportSql();
  const result = readDatabase(sql, data);
  const notes = result.flatMap((type) => type.parsed.rows);
  if (!notes.length) throw new Error(t('vocab.import.apkg.noNotes'));
  if (
    collection.name === 'collection.anki2' &&
    notes.length === 1 &&
    /please update to the latest anki|requires a newer version of anki/i.test(notes[0].fields.join(' '))
  )
    throw new Error(t('vocab.import.apkg.stub'));
  return result;
}

function readDatabase(sql: SqlJsStatic, data: Uint8Array) {
  // Opening a file does not validate SQLite until the first query; keep both inside the same boundary.
  try {
    const db = new sql.Database(data);
    try {
      return readNoteTypes(db);
    } finally {
      db.close();
    }
  } catch (error) {
    throw new Error(t('vocab.import.apkg.database', { reason: errorMessage(error) }));
  }
}

function unzipCollection(bytes: Uint8Array) {
  try {
    const names: string[] = [];
    unzipSync(bytes, {
      filter: (entry) => {
        if (collections.includes(entry.name) && entry.originalSize > MAX_DATABASE_BYTES)
          throw new ImportRefusal({
            key: 'vocab.import.errors.databaseTooLarge',
            params: { size: MAX_DATABASE_BYTES / 1024 / 1024 },
          });
        names.push(entry.name);
        return false;
      },
    });
    const name = collections.find((name) => names.includes(name));
    // Inspect the directory first: even obsolete collections must not be inflated, let alone media.
    return name ? { name, bytes: unzipSync(bytes, { filter: (entry) => entry.name === name })[name] } : null;
  } catch (error) {
    if (error instanceof ImportRefusal) throw error;
    throw new Error(t('vocab.import.apkg.zip', { reason: errorMessage(error) }));
  }
}

async function decodeCollection(bytes: Uint8Array) {
  const { decompress } = await import('fzstd');
  try {
    // A fixed output buffer also bounds concatenated frames and a frame that lies about its content size.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0xfd2fb528) return decompress(bytes, new Uint8Array(0));
    const descriptor = view.getUint8(4);
    const single = (descriptor & 32) !== 0;
    const flag = descriptor >> 6;
    const sizeBytes = flag ? 1 << flag : single ? 1 : 0;
    if (!sizeBytes) throw new ImportRefusal({ key: 'vocab.import.errors.unknownDatabaseSize' });
    const dictionary = descriptor & 3;
    const offset = 5 + (single ? 0 : 1) + (dictionary === 3 ? 4 : dictionary);
    const size = Array.from({ length: sizeBytes }, (_, i) => BigInt(view.getUint8(offset + i))).reduce(
      (total, byte, i) => total + (byte << BigInt(8 * i)),
      flag === 1 ? 256n : 0n,
    );
    if (size > BigInt(MAX_DATABASE_BYTES))
      throw new ImportRefusal({
        key: 'vocab.import.errors.databaseTooLarge',
        params: { size: MAX_DATABASE_BYTES / 1024 / 1024 },
      });
    return decompress(bytes, new Uint8Array(Number(size)));
  } catch (error) {
    if (error instanceof ImportRefusal) throw error;
    throw new Error(t('vocab.import.apkg.zstd', { reason: errorMessage(error) }));
  }
}

const fieldSchema = z.object({ name: z.string(), ord: z.number().int().nonnegative() });
const modelSchema = z.object({ id: z.number(), name: z.string(), flds: z.array(fieldSchema) });
const deckSchema = z.object({ id: z.number(), name: z.string() });

function readMetadata(db: Database) {
  const select = (sql: string) => db.exec(sql)[0]?.values ?? [];
  const tables = z.array(z.tuple([z.string()])).parse(select('SELECT name FROM sqlite_master'));
  if (!tables.some(([name]) => name === 'notetypes')) {
    const [[models, decks]] = z
      .array(z.tuple([z.string(), z.string()]))
      .nonempty()
      .parse(select('SELECT models, decks FROM col'));
    return {
      types: Object.values(z.record(z.string(), modelSchema).parse(JSON.parse(models))),
      decks: Object.values(z.record(z.string(), deckSchema).parse(JSON.parse(decks))),
    };
  }
  // No SQL ordering/comparison on Anki's custom `unicase` columns: sql.js has no such collation.
  const fields = z
    .array(z.tuple([z.number(), z.number().int().nonnegative(), z.string()]))
    .parse(select('SELECT ntid, ord, name FROM fields'));
  return {
    types: z
      .array(z.tuple([z.number(), z.string()]))
      .parse(select('SELECT id, name FROM notetypes'))
      .map(([id, name]) => ({
        id,
        name,
        flds: fields.filter(([ntid]) => ntid === id).map(([, ord, name]) => ({ ord, name })),
      })),
    decks: z
      .array(z.tuple([z.number(), z.string()]))
      .parse(select('SELECT id, name FROM decks'))
      .map(([id, name]) => ({ id, name })),
  };
}

function readNoteTypes(db: Database): ApkgNoteType[] {
  const select = (sql: string) => db.exec(sql)[0]?.values ?? [];
  const { types, decks } = readMetadata(db);
  const deckNames = new Map(decks.map((deck) => [deck.id, deck.name.replaceAll('\u001f', '::')]));
  const cards = z.array(z.tuple([z.number(), z.number(), z.number()])).parse(select('SELECT id, nid, did FROM cards'));
  const firstDeck = new Map<number, string>();
  cards
    .sort((a, b) => a[0] - b[0])
    .forEach(([, nid, did]) => {
      if (!firstDeck.has(nid)) firstDeck.set(nid, deckNames.get(did) ?? '');
    });
  const notes = z
    .array(z.tuple([z.number(), z.string(), z.number(), z.string(), z.string()]))
    .parse(select('SELECT id, guid, mid, flds, tags FROM notes'))
    .sort((a, b) => a[0] - b[0]);
  if (notes.some(([, , mid]) => !types.some((type) => type.id === mid)))
    throw new Error(t('vocab.import.apkg.unknownType'));
  return types
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
    .map((type) => {
      const fieldNames = type.flds.toSorted((a, b) => a.ord - b.ord).map((field) => field.name);
      const rows = notes
        .filter(([, , mid]) => mid === type.id)
        .map(([id, guid, , flds, tags], index) => {
          const fields = flds.split('\u001f');
          return {
            row: index + 1,
            fields: [...fields, guid, firstDeck.get(id) ?? '', tags],
            ...(fields.length !== fieldNames.length
              ? { error: t('vocab.import.apkg.fieldCount', { actual: fields.length, expected: fieldNames.length }) }
              : !firstDeck.get(id)
                ? { error: t('vocab.import.apkg.noDeck') }
                : {}),
          };
        });
      return {
        id: type.id,
        name: type.name,
        fieldNames,
        noteCount: rows.length,
        parsed: {
          separator: 'tab',
          headers: {
            columns: fieldNames,
            guidColumn: fieldNames.length,
            deckColumn: fieldNames.length + 1,
            tagsColumn: fieldNames.length + 2,
          },
          rows,
        },
      };
    });
}
