/** Invented Anki-shaped databases only, generated in memory. No real export or binary fixture. */
import { zipSync } from 'fflate';
import { loadImportSql } from '../../src/services/vocabulary/import/sqlLoader';

export const importSql = await loadImportSql(
  new Uint8Array(
    await Bun.file(new URL('../../node_modules/sql.js/dist/sql-wasm-browser.wasm', import.meta.url)).arrayBuffer(),
  ),
);

export interface FixtureNote {
  id: number;
  guid: string;
  mid: number;
  fields: string[];
  tags: string;
}
export const fixtureNotes: FixtureNote[] = [
  {
    id: 100,
    guid: 'TEST-guid-1',
    mid: 1,
    fields: ["<b>l'e\u0301te\u0301</b>[sound:été.mp3]", 'Summer &amp; sun', 'Voici l’été.'],
    tags: ' season sunny season ',
  },
  { id: 101, guid: 'TEST-guid-2', mid: 1, fields: ['chat', 'cat<br>pet', 'Le chat dort.'], tags: 'animal' },
  { id: 102, guid: 'TEST-guid-3', mid: 2, fields: ['dog', 'chien'], tags: 'animal pet' },
];

export function fixtureCollection(schema: 11 | 18, notes = fixtureNotes, unicase = false): Uint8Array {
  const db = new importSql.Database();
  try {
    db.run(`CREATE TABLE notes(id integer primary key, guid text, mid integer, mod integer, usn integer,
      tags text, flds text, sfld integer, csum integer, flags integer, data text);
      CREATE TABLE cards(id integer primary key, nid integer, did integer, ord integer, due integer, ivl integer);
      CREATE TABLE revlog(ignored text);`);
    if (schema === 11) {
      db.run('CREATE TABLE col(ver integer, models text, decks text)');
      db.run('INSERT INTO col VALUES(11, ?, ?)', [
        JSON.stringify({
          1: {
            id: 1,
            name: 'TEST Basic',
            flds: [
              { name: 'Example', ord: 2 },
              { name: 'Front', ord: 0 },
              { name: 'Back', ord: 1 },
            ],
          },
          2: {
            id: 2,
            name: 'TEST Reversed',
            flds: [
              { name: 'Meaning', ord: 0 },
              { name: 'French', ord: 1 },
            ],
          },
          3: { id: 3, name: 'TEST Empty', flds: [{ name: 'Front', ord: 0 }] },
        }),
        JSON.stringify({ 10: { id: 10, name: 'TEST Parent::Child' }, 20: { id: 20, name: 'TEST Other' } }),
      ]);
    }
    if (schema === 18) {
      db.run(`CREATE TABLE notetypes(id integer primary key, name text COLLATE BINARY);
        CREATE TABLE fields(ntid integer, ord integer, name text COLLATE BINARY);
        CREATE TABLE decks(id integer primary key, name text COLLATE BINARY);
        INSERT INTO notetypes VALUES(2, 'TEST Reversed'), (1, 'TEST Basic'), (3, 'TEST Empty');
        INSERT INTO fields VALUES(1, 2, 'Example'), (2, 1, 'French'), (1, 0, 'Front'), (2, 0, 'Meaning'), (1, 1, 'Back'), (3, 0, 'Front');`);
      db.run('INSERT INTO decks VALUES(10, ?), (20, ?)', ['TEST Parent\u001fChild', 'TEST Other']);
    }
    notes.forEach((note) => {
      db.run('INSERT INTO notes VALUES(?, ?, ?, 0, 0, ?, ?, 0, 0, 0, ?)', [
        note.id,
        note.guid,
        note.mid,
        note.tags,
        note.fields.join('\u001f'),
        '',
      ]);
      db.run('INSERT INTO cards VALUES(?, ?, 10, 0, 999999, 900)', [note.id * 2, note.id]);
      // The second card belongs to another deck: only the lowest-id card's deck should survive.
      db.run('INSERT INTO cards VALUES(?, ?, 20, 1, 123456, 50)', [note.id * 2 + 1, note.id]);
    });
    if (unicase) {
      // sql.js cannot register collations. Change schema text after building, then reopen in the reader.
      db.run(`PRAGMA writable_schema = ON;
        UPDATE sqlite_master SET sql = replace(sql, 'COLLATE BINARY', 'COLLATE unicase');`);
    }
    return db.export();
  } finally {
    db.close();
  }
}

export function fixturePackage(collection: Uint8Array, name = 'collection.anki2') {
  return zipSync({ [name]: collection, media: new TextEncoder().encode('{}'), '0': new Uint8Array([1, 2, 3]) });
}

/** Zstandard single-segment frame, four-byte content size, one final RAW block (fixtures < 128 KiB). */
export function rawZstd(data: Uint8Array): Uint8Array {
  if (data.length > 128 * 1024) throw new Error('TEST raw block exceeds Zstandard maximum');
  const frame = new Uint8Array(12 + data.length);
  frame.set([0x28, 0xb5, 0x2f, 0xfd, 0xa0]);
  new DataView(frame.buffer).setUint32(5, data.length, true);
  const blockHeader = (data.length << 3) | 1;
  frame.set([blockHeader & 255, (blockHeader >> 8) & 255, (blockHeader >> 16) & 255], 9);
  frame.set(data, 12);
  return frame;
}
