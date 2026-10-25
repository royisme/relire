/** Invented packages exercise the real browser-build wasm, ZIP, Zstandard, preparation and IndexedDB. */
import { beforeEach, expect, test } from 'bun:test';
import { zipSync } from 'fflate';
import { decompress } from 'fzstd';
import '../src/i18n';
import { checkApkgSize, MAX_APKG_BYTES, readApkg, readApkgFile } from '../src/services/vocabulary/import/apkg';
import { defaultImportColumns, prepareVocabularyImport } from '../src/services/vocabulary/import/prepare';
import {
  getVocabularySnapshot,
  importVocabularyNotes,
  introduceVocabularyCard,
  rateVocabularyCard,
  saveVocabularyBookmark,
} from '../src/storage/vocabulary';
import { exportData } from '../src/storage/db';
import { fixtureCollection, fixtureNotes, fixturePackage, importSql, rawZstd } from './fixtures/apkg';
import { freshDb, failure } from './fixtures/storage';
import { errorMessage } from '../src/services/ai/errors';
import { testDefinition, testLookup } from './fixtures/vocabulary';

const now = 123456789;
beforeEach(freshDb);

for (const schema of [11, 18] as const) {
  test(`schema ${schema}: several types, ordered fields/notes, first-card deck, nested names, tags and GUID identity`, async () => {
    const collection = fixtureCollection(schema);
    const types = await readApkg(
      fixturePackage(
        schema === 18 ? rawZstd(collection) : collection,
        schema === 18 ? 'collection.anki21b' : 'collection.anki2',
      ),
    );
    expect(types.map((type) => [type.name, type.noteCount])).toEqual([
      ['TEST Basic', 2],
      ['TEST Empty', 0],
      ['TEST Reversed', 1],
    ]);
    expect(types[0].fieldNames).toEqual(['Front', 'Back', 'Example']);
    const parsed = types[0].parsed;
    expect(defaultImportColumns(parsed)).toEqual({ front: 0, back: 1, example: null });
    expect(parsed.rows[0]).toEqual({
      row: 1,
      fields: [...fixtureNotes[0].fields, 'TEST-guid-1', 'TEST Parent::Child', ' season sunny season '],
    });
    const batch = prepareVocabularyImport(parsed, { front: 0, back: 1, example: 2 }, 'unused', 'en', now);
    expect(batch.rejected).toEqual([]);
    expect(batch.notes[0]).toMatchObject({
      word: 'l’été',
      context: {
        id: JSON.stringify(['import', 'TEST Parent::Child', 'TEST-guid-1']),
        source: { kind: 'import', id: 'TEST Parent::Child', title: 'TEST Parent::Child', noteId: 'TEST-guid-1' },
        definition: {
          kind: 'imported',
          front: 'l’été',
          back: 'Summer & sun',
          example: 'Voici l’été.',
          tags: ['season', 'sunny'],
        },
      },
    });
    expect(batch.notes[1].context.definition).toMatchObject({ back: 'cat pet' });
    const reversed = prepareVocabularyImport(
      types[2].parsed,
      { front: 1, back: 0, example: null },
      'unused',
      'zh',
      now,
    );
    expect(reversed.notes[0].word).toBe('chien');
    expect(reversed.notes[0].context.requestLanguage).toBe('zh');
  });
}

test('single RAW-block Zstandard helper decodes to the exact SQLite bytes with fzstd', () => {
  const bytes = fixtureCollection(18);
  expect(decompress(rawZstd(bytes))).toEqual(bytes);
});

test('newest collection wins over anki21 and the update stub; anki21 wins over anki2', async () => {
  const stub = fixtureCollection(11, [
    {
      ...fixtureNotes[0],
      fields: ['Please update to the latest Anki version, then import the .apkg/.colpkg file again.', 'stub', 'stub'],
    },
  ]);
  const preferred = await readApkg(
    zipSync({
      'collection.anki21b': rawZstd(fixtureCollection(18)),
      'collection.anki21': fixtureCollection(11, [fixtureNotes[1]]),
      'collection.anki2': stub,
    }),
  );
  expect(preferred[0].noteCount).toBe(2);
  const middle = await readApkg(
    zipSync({
      'collection.anki21': fixtureCollection(11, [fixtureNotes[1]]),
      'collection.anki2': stub,
    }),
  );
  expect(middle[0].parsed.rows[0].fields[0]).toBe('chat');
  expect(middle[0].noteCount).toBe(1);
  expect(errorMessage(await failure(readApkg(fixturePackage(stub))))).toContain('only Anki’s update notice');
});

test('schema 18 tables declaring the unregistered unicase collation are readable without comparison or SQL sorting', async () => {
  const bytes = fixtureCollection(18, fixtureNotes, true);
  const db = new importSql.Database(bytes);
  try {
    expect(
      db
        .exec('SELECT sql FROM sqlite_master')
        .flatMap((row) => row.values.flat())
        .join(' '),
    ).toContain('COLLATE unicase');
    expect(() => db.exec('SELECT name FROM notetypes ORDER BY name')).toThrow('no such collation sequence: unicase');
  } finally {
    db.close();
  }
  const types = await readApkg(fixturePackage(rawZstd(bytes), 'collection.anki21b'));
  expect(types[0].fieldNames).toEqual(['Front', 'Back', 'Example']);
  expect(types[0].parsed.rows[0].fields[4]).toBe('TEST Parent::Child');
});

test('refused notes keep their one-based position within the chosen type and the unchanged preparation reason', async () => {
  const types = await readApkg(
    fixturePackage(
      fixtureCollection(11, [
        fixtureNotes[0],
        { ...fixtureNotes[1], fields: ['[sound:empty.mp3]', 'cat', 'Le chat dort.'] },
        { ...fixtureNotes[1], id: 103, fields: ['soleil', '&unknown;', 'Le soleil brille.'] },
        { ...fixtureNotes[1], id: 104, fields: ['arbre'] },
      ]),
    ),
  );
  const batch = prepareVocabularyImport(types[0].parsed, { front: 0, back: 1, example: null }, 'unused', 'en', now);
  expect(batch.notes).toHaveLength(1);
  expect(batch.rejected.map((note) => note.row)).toEqual([2, 3, 4]);
  expect(batch.rejected[0].reason).toEqual({
    key: 'vocab.import.errors.invalidFields',
    params: { fields: 'definition.front' },
  });
  expect(batch.rejected[1].reason).toEqual({
    key: 'vocab.import.errors.unsupportedEntity',
    params: { entity: '&unknown;' },
  });
  expect(batch.rejected[2].reason).toBe('The note has 1 fields; its note type declares 3.');
});

test('package notes use the existing atomic IndexedDB importer and duplicate/GUID merge rules, with no scheduling imported', async () => {
  const prior = await saveVocabularyBookmark(testLookup('chat'), testDefinition('chat'), undefined, now - 10);
  const introduced = await introduceVocabularyCard(prior, { epoch: 0, resetToken: 0, revision: 0 }, now - 5);
  const rated = await rateVocabularyCard(prior.key, introduced.tokens, 'TEST-existing-rating', 'remembered', now - 2);
  const priorMeta = (await exportData()).vocabularyMeta;
  const types = await readApkg(fixturePackage(rawZstd(fixtureCollection(18)), 'collection.anki21b'));
  const batch = prepareVocabularyImport(types[0].parsed, { front: 0, back: 1, example: null }, 'unused', 'en', now);
  expect(await importVocabularyNotes(batch.notes, now)).toEqual({ imported: 1, merged: 1 });
  expect(await importVocabularyNotes(batch.notes, now + 10)).toEqual({ imported: 0, merged: 2 });
  const chat = (await getVocabularySnapshot('chat')).row!;
  expect(chat.contexts).toHaveLength(2);
  expect(chat.contexts[0]).toEqual(prior.contexts[0]);
  expect(chat.bookmarkedAt).toBe(prior.bookmarkedAt);
  expect(chat.schedule).toEqual(rated.row.schedule);
  expect(chat.history).toEqual(rated.row.history);
  expect(chat.revision).toBe(rated.row.revision);
  const summer = (await getVocabularySnapshot('l’été')).row!;
  expect(summer.bookmarked).toBe(true);
  expect(summer.schedule).toBeNull();
  expect(summer.history).toEqual([]);
  const backup = await exportData();
  expect(backup.vocab).toHaveLength(2);
  expect(backup.vocabularyMeta).toEqual(priorMeta);
});

test('duplicate words within a package merge into one canonical row with distinct GUID contexts', async () => {
  const types = await readApkg(
    fixturePackage(
      fixtureCollection(11, [
        fixtureNotes[1],
        { ...fixtureNotes[1], id: 105, guid: 'TEST-duplicate', fields: ['CHAT', 'feline', 'Le chat dort.'] },
      ]),
    ),
  );
  const batch = prepareVocabularyImport(types[0].parsed, { front: 0, back: 1, example: null }, 'unused', 'en', now);
  expect(await importVocabularyNotes(batch.notes, now)).toEqual({ imported: 1, merged: 1 });
  expect((await getVocabularySnapshot('chat')).row?.contexts).toHaveLength(2);
});

test('orphan notes are refused instead of assigned a made-up deck or silently omitted', async () => {
  const db = new importSql.Database(fixtureCollection(18, [fixtureNotes[0]]));
  try {
    db.run('DELETE FROM cards');
    const types = await readApkg(fixturePackage(rawZstd(db.export()), 'collection.anki21b'));
    const batch = prepareVocabularyImport(types[0].parsed, { front: 0, back: 1, example: null }, 'unused', 'en', now);
    expect(batch.notes).toHaveLength(0);
    expect(batch.rejected).toEqual([{ row: 1, reason: 'The note has no first-card deck in this package.' }]);
    db.run('UPDATE notes SET mid = 99');
    expect(errorMessage(await failure(readApkg(fixturePackage(db.export()))))).toContain('note type missing');
  } finally {
    db.close();
  }
});

test('refusals: not ZIP, no collection, no notes, corrupt Zstandard and corrupt SQLite, with real reasons', async () => {
  for (const [bytes, reason] of [
    [new TextEncoder().encode('not a zip'), 'ZIP package'],
    [zipSync({ media: new Uint8Array() }), 'no collection.anki21b'],
    [fixturePackage(fixtureCollection(11, [])), 'contains no notes'],
    [fixturePackage(new Uint8Array([1, 2, 3]), 'collection.anki21b'), 'Zstandard'],
    [fixturePackage(new TextEncoder().encode('not sqlite')), 'file is not a database'],
    // A corrupt preferred collection is not silently replaced by an older collection.
    [zipSync({ 'collection.anki21b': new Uint8Array([1]), 'collection.anki2': fixtureCollection(11) }), 'Zstandard'],
  ] as const) {
    expect(errorMessage(await failure(readApkg(bytes)))).toContain(reason);
  }
});

test('50 MiB file-size guard runs before arrayBuffer and also protects direct reader calls', async () => {
  expect(() => checkApkgSize(MAX_APKG_BYTES)).not.toThrow();
  expect(() => checkApkgSize(MAX_APKG_BYTES + 1)).toThrow('50 MiB');
  let reads = 0;
  expect(
    errorMessage(
      await failure(
        readApkgFile({
          size: MAX_APKG_BYTES + 1,
          arrayBuffer: () => {
            reads += 1;
            throw new Error('TEST must not read');
          },
        }),
      ),
    ),
  ).toContain('50 MiB');
  expect(reads).toBe(0);
  expect(errorMessage(await failure(readApkg(new Uint8Array(MAX_APKG_BYTES + 1))))).toContain('50 MiB');
});
