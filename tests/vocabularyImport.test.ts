/** Invented local exports only: parse/normalize/validate, atomic merges, quota order, game content and backups. */
import { beforeEach, expect, test } from 'bun:test';
import { parsePlainText } from '../src/services/vocabulary/import/plainText';
import {
  defaultImportColumns,
  normalizeImportText,
  prepareVocabularyImport,
} from '../src/services/vocabulary/import/prepare';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import { buildChallenge, cardContent } from '../src/services/vocabulary/game/challenge';
import { deckRegionId, summarizeRegions } from '../src/services/vocabulary/game/regions';
import { vocabularyQueue } from '../src/services/vocabulary/queue';
import { BUILTIN_WORDS, MY_WORDS, deckStudyBook } from '../src/services/vocabulary/wordbooks';
import { VocabularyRowSchema } from '../src/types/vocabulary';
import { exportData, importData } from '../src/storage/db';
import {
  getVocabularySnapshot,
  importVocabularyNotes,
  introduceVocabularyCard,
  rateVocabularyCard,
  saveVocabularyBookmark,
  saveVocabularyPreferences,
  VocabularyQuotaError,
} from '../src/storage/vocabulary';
import { freshDb, failure } from './fixtures/storage';
import { testBook, testDefinition, testLookup } from './fixtures/vocabulary';

const now = new Date(2026, 9, 25, 12).getTime();
const columns = { front: 0, back: 1, example: null };
const prepare = (text: string, deck = 'TEST deck') =>
  prepareVocabularyImport(parsePlainText(text), columns, deck, 'en', now);
beforeEach(freshDb);

test('separator declarations, BOM, CRLF and every optional Anki header are retained, with one-based columns converted once', () => {
  const parsed = parsePlainText(
    '\uFEFF#separator:tab\r\n#html:true\r\n#guid column:1\r\n#notetype column:2\r\n' +
      '#deck column:3\r\n#tags column:6\r\n#columns:GUID\tType\tDeck\tFront\tBack\tTags\r\n' +
      'g-1\tBasic\tTEST\tchat\tcat\tanimal pet',
  );
  expect(parsed.separator).toBe('tab');
  expect(parsed.headers).toEqual({
    html: true,
    guidColumn: 0,
    notetypeColumn: 1,
    deckColumn: 2,
    tagsColumn: 5,
    columns: ['GUID', 'Type', 'Deck', 'Front', 'Back', 'Tags'],
  });
  expect(parsed.rows).toEqual([{ row: 8, fields: ['g-1', 'Basic', 'TEST', 'chat', 'cat', 'animal pet'] }]);
  expect(defaultImportColumns(parsed)).toEqual({ front: 3, back: 4, example: null });
  for (const [separator, delimiter] of [
    ['tab', '\t'],
    ['comma', ','],
    ['semicolon', ';'],
    ['space', ' '],
    ['pipe', '|'],
  ] as const) {
    const result = parsePlainText(`#separator:${separator}\nchat${delimiter}cat`);
    expect(result.separator).toBe(separator);
    expect(result.rows[0].fields).toEqual(['chat', 'cat']);
  }
  expect(() => parsePlainText('#separator:unknown\na,b')).toThrow('vocab.import.errors.separator');
  expect(() => parsePlainText('#separator:constructor\na,b')).toThrow('vocab.import.errors.separator');
  expect(() => parsePlainText('#guid column:0\na,b')).toThrow('vocab.import.errors.columnHeader');
});

test('automatic tab/semicolon/comma detection ignores delimiters inside quotes; quoted newlines and doubled quotes are data', () => {
  for (const [separator, text] of [
    ['tab', 'chat\tcat, pet; animal'],
    ['semicolon', 'chat;"cat, pet"'],
    ['comma', 'chat,"cat; pet"'],
  ] as const)
    expect(parsePlainText(text).separator).toBe(separator);
  const parsed = parsePlainText('"chat","a ""cat"",\r\npet"\r\nchien,dog\r\n');
  expect(parsed.rows).toEqual([
    { row: 1, fields: ['chat', 'a "cat",\npet'] },
    { row: 3, fields: ['chien', 'dog'] },
  ]);
  expect(parsePlainText('"#mot",answer').rows[0].fields[0]).toBe('#mot');
  expect(parsePlainText('chat,cat\n# comment\nchien,dog').rows.map((row) => row.row)).toEqual([1, 3]);
  expect(parsePlainText('""').rows).toEqual([{ row: 1, fields: [''] }]);
  expect(prepare('""').rejected).toHaveLength(1);
  expect(parsePlainText('\n# comment\n\nchat\tcat\n\n').rows[0].row).toBe(4);
  expect(parsePlainText('#html:false\nchat\tcat').headers.html).toBe(false);
  expect(parsePlainText('l&apos;été,summer &amp; season').separator).toBe('comma');
});

test('column choices control the French/answer/example, row deck and tags; GUID identities ignore example and UI language', () => {
  const parsed = parsePlainText(
    '#separator:tab\n#guid column:1\n#deck column:2\n#tags column:6\ng-1\tTEST animals\tcat\tchat\tLe chat dort.\tpet animal pet\ng-2\tTEST animals\tdog\tchien\tLe chien dort.\tpet',
  );
  const selected = { front: 3, back: 2, example: 4 };
  const batch = prepareVocabularyImport(parsed, selected, 'unused', 'zh', now);
  expect(batch.rejected).toEqual([]);
  expect(batch.notes[0].word).toBe('chat');
  expect(batch.notes[0].context.definition).toEqual({
    kind: 'imported',
    front: 'chat',
    back: 'cat',
    example: 'Le chat dort.',
    tags: ['pet', 'animal'],
  });
  expect(batch.notes[0].context.source).toEqual({
    kind: 'import',
    id: 'TEST animals',
    title: 'TEST animals',
    noteId: 'g-1',
  });
  expect(batch.notes[0].context.id).toBe(JSON.stringify(['import', 'TEST animals', 'g-1']));
  expect(batch.notes[0].context.requestLanguage).toBe('zh');
  const changed = prepareVocabularyImport(parsed, { ...selected, example: null }, 'unused', 'en', now);
  expect(changed.notes[0].context.id).toBe(batch.notes[0].context.id);
  expect(changed.notes[0].context.sentence).toBe('');
  expect(changed.notes[0].context.id).not.toBe(changed.notes[1].context.id);
  expect(prepareVocabularyImport(parsed, { ...selected, back: 3 }, 'unused', 'en', now).rejected[0].reason).toEqual({
    key: 'vocab.import.errors.differentColumns',
  });
});

test('HTML, entities, sound, NFC and apostrophes normalize BEFORE French validation', () => {
  expect(
    normalizeImportText(" <b>l'e\u0301te&#x301;</b><br /> &amp; &eacute; &oelig; &#39; &#160;[sound:clip.mp3] "),
  ).toBe('l’été  & é œ ’'.normalize('NFC'));
  expect(normalizeImportText('&Agrave;&ccedil;&Eacute;&yuml;&hellip;')).toBe('ÀçÉÿ…');
  expect(normalizeImportText('<span title="a > b">chat</span><!-- hidden -->')).toBe('chat');
  expect(normalizeImportText('&NotEqualTilde; &AMP;')).toBe('≂̸ &'.normalize('NFC'));
  const batch = prepare("<b>l'e\u0301te\u0301</b>\tSummer<br>season [sound:a.mp3]");
  expect(batch.rejected).toEqual([]);
  expect(batch.notes[0].context.definition).toEqual({
    kind: 'imported',
    front: 'l’été',
    back: 'Summer season',
    tags: [],
  });
  expect(VocabularyRowSchema.shape.word.safeParse("l'été").success).toBe(false);
});

test('every malformed or empty selected value is rejected with its physical row and real reason, never silently dropped', () => {
  const batch = prepare(
    '#separator:tab\nchat\tcat\n[sound:a.mp3]\tanswer\nchien\nsoleil\t&unknown;\nfin\t"unclosed\nfield',
  );
  expect(batch.notes).toHaveLength(1);
  expect(batch.rejected.map((row) => row.row)).toEqual([3, 4, 5, 6]);
  expect(batch.rejected[0].reason).toEqual({
    key: 'vocab.import.errors.invalidFields',
    params: { fields: 'definition.front' },
  });
  expect(batch.rejected[1].reason).toEqual({ key: 'vocab.import.errors.missingColumn', params: { column: 2 } });
  expect(batch.rejected[2].reason).toEqual({
    key: 'vocab.import.errors.unsupportedEntity',
    params: { entity: '&unknown;' },
  });
  expect(batch.rejected[3].reason).toEqual({ key: 'vocab.import.errors.unclosedQuote' });
  expect(prepare('chat,"cat"oops').rejected[0].reason).toEqual({ key: 'vocab.import.errors.unexpectedQuote' });
  expect(prepare('chat,&#0;').rejected[0].reason).toEqual({
    key: 'vocab.import.errors.invalidEntity',
    params: { entity: '&#0;' },
  });
  expect(prepare('chat,&constructor;').rejected[0].reason).toEqual({
    key: 'vocab.import.errors.unsupportedEntity',
    params: { entity: '&constructor;' },
  });
  expect(prepare('chat,control\u0000').rejected[0].reason).toEqual({ key: 'vocab.import.errors.controlCharacter' });
  expect(prepare('chat,&lt;b&gt;still markup&lt;/b&gt;').rejected[0].reason).toEqual({
    key: 'vocab.import.errors.invalidFields',
    params: { fields: 'definition.back' },
  });
  const emptyExample = prepareVocabularyImport(
    parsePlainText('chat\tcat\t<br>'),
    { ...columns, example: 2 },
    'TEST',
    'en',
    now,
  );
  expect(emptyExample.rejected[0].reason).toEqual({
    key: 'vocab.import.errors.invalidFields',
    params: { fields: 'definition.example' },
  });
  expect(
    prepareVocabularyImport(parsePlainText('#guid column:3\nchat\tcat\t'), columns, 'TEST', 'en', now).rejected[0]
      .reason,
  ).toEqual({ key: 'vocab.import.errors.invalidFields', params: { fields: 'source.noteId' } });
});

test('duplicates merge canonical rows, preserve review schedule/history/revision and existing contexts, and create no review writes', async () => {
  const saved = await saveVocabularyBookmark(testLookup('chat'), testDefinition('chat'), undefined, now - 20);
  const introduced = await introduceVocabularyCard(saved, { epoch: 0, resetToken: 0, revision: 0 }, now - 10);
  const rated = await rateVocabularyCard(saved.key, introduced.tokens, 'TEST-rating', 'remembered', now - 5);
  const priorBackup = await exportData();
  expect(await importVocabularyNotes(prepare('CHAT\tcat\nchat\tfeline\nchien\tdog').notes, now)).toEqual({
    imported: 1,
    merged: 2,
  });
  const current = (await getVocabularySnapshot('chat')).row!;
  expect(current.schedule).toEqual(rated.row.schedule);
  expect(current.history).toEqual(rated.row.history);
  expect(current.revision).toBe(rated.row.revision);
  expect(current.introducedAt).toBe(rated.row.introducedAt);
  expect(current.bookmarkedAt).toBe(saved.bookmarkedAt);
  expect(current.contexts).toHaveLength(3);
  expect(current.contexts[0]).toEqual(saved.contexts[0]);
  expect((await exportData()).vocabularyMeta).toEqual(priorBackup.vocabularyMeta);
  expect((await exportData()).vocab).toHaveLength(2);
  expect((await getVocabularySnapshot('chien')).row?.schedule).toBeNull();
});

test('a late native batch abort rolls every imported row back and permits the same batch to be retried', async () => {
  const notes = prepare('chat\tcat\nchien\tdog').notes;
  // oxlint-disable-next-line typescript/unbound-method -- Native abort injection, restored in finally.
  const put = IDBObjectStore.prototype.put;
  let writes = 0;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (this.name === 'vocab' && ++writes === 2) request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    expect(await failure(importVocabularyNotes(notes, now))).toBeInstanceOf(Error);
    expect((await exportData()).vocab).toEqual([]);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  expect(await importVocabularyNotes(notes, now)).toEqual({ imported: 2, merged: 0 });
});

test('GUID reimport updates one note context without duplicating it; no-example contexts are distinct by row and deck', async () => {
  const first = prepare('#guid column:3\nchat\tcat\tg1\nchat\tfeline\tg2');
  await importVocabularyNotes(first.notes, now);
  const revised = prepare('#guid column:3\nchat\ta cat\tg1');
  expect(await importVocabularyNotes(revised.notes, now)).toEqual({ imported: 0, merged: 1 });
  const row = (await getVocabularySnapshot('chat')).row!;
  expect(row.contexts).toHaveLength(2);
  expect(row.contexts.find((c) => c.source?.kind === 'import' && c.source.noteId === 'g1')?.definition).toMatchObject({
    back: 'a cat',
  });
  const noExample = prepare('chat\tcat\nchat\tfeline').notes;
  expect(noExample[0].context.id).not.toBe(noExample[1].context.id);
  expect(noExample[0].context.id).not.toBe(prepare('chat\tcat', 'another TEST deck').notes[0].context.id);
  expect(vocabularyContextKey(noExample[0].context)).toBe(noExample[0].context.id);
});

test('new bookmarks increase in file order even under one clock and append after existing bookmarks', async () => {
  await saveVocabularyBookmark(testLookup('old'), testDefinition('old'), undefined, now + 10);
  await importVocabularyNotes(prepare('zebre\tzebra\narbre\ttree\nchat\tcat').notes, now);
  const times = await Promise.all(
    ['old', 'zebre', 'arbre', 'chat'].map(async (key) => (await getVocabularySnapshot(key)).row!.bookmarkedAt!),
  );
  expect(times).toEqual([now + 10, now + 11, now + 12, now + 13]);
});

test('an imported deck is its own wordbook and still shares the one daily-new allowance', async () => {
  const book = await testBook(2);
  await saveVocabularyPreferences({ newPerDay: 2, retentionPercent: 90, studyBook: 'mine' });
  await importVocabularyNotes(prepare('zebre\tzebra\narbre\ttree').notes, now);
  const backup = await exportData();
  const day = { date: '2026-10-25', introducedKeys: [] as string[] };
  const queue = (rows: typeof backup.vocab, studyBook: string) =>
    vocabularyQueue(rows, book, day, 2, now, new Set(), studyBook).candidates.map((c) => c.key);
  // An imported deck is not My words: the deck's own entry is studied on its own.
  expect(queue(backup.vocab, MY_WORDS)).toEqual([]);
  expect(queue(backup.vocab, deckStudyBook('TEST deck'))).toEqual(['zebre', 'arbre']);
  expect(queue(backup.vocab, BUILTIN_WORDS)).toEqual(['test-0', 'test-1']);
  // The allowance is durable and shared: one deck card and one book front use up the two new words a day.
  const first = await introduceVocabularyCard(
    backup.vocab.find((row) => row.key === 'zebre')!,
    { epoch: 0, resetToken: 0, revision: 0 },
    now,
  );
  await introduceVocabularyCard(
    {
      key: book.entries[0].key,
      word: book.entries[0].word,
      bookSource: {
        bookId: book.manifest.bookId,
        version: book.manifest.version,
        sourceIds: book.entries[0].sourceIds,
        senses: book.entries[0].senses,
      },
    },
    { epoch: 0, resetToken: 0, revision: 0 },
    now + 1,
  );
  expect(
    await failure(
      introduceVocabularyCard(
        backup.vocab.find((row) => row.key === 'arbre')!,
        { epoch: 0, resetToken: 0, revision: 0 },
        now + 2,
      ),
    ),
  ).toBeInstanceOf(VocabularyQuotaError);
  const after = await exportData();
  expect(after.vocabularyMeta.days[0].introducedKeys).toEqual([first.row.key, 'test-0']);
  expect(
    vocabularyQueue(after.vocab, book, after.vocabularyMeta.days[0], 2, now + 2, new Set(), MY_WORDS).candidates.map(
      (c) => c.key,
    ),
  ).not.toContain('arbre');
});

test('imported definitions and import sources round-trip export, raw validation and restore without a schema/version shim', async () => {
  const batch = prepareVocabularyImport(
    parsePlainText('#tags column:4\nchat\tcat\tLe chat dort.\tpet animal'),
    { ...columns, example: 2 },
    'TEST deck',
    'zh',
    now,
  );
  await importVocabularyNotes(batch.notes, now);
  const backup = await exportData();
  await importData({ vocab: [], vocabularyMeta: backup.vocabularyMeta });
  await importData(JSON.parse(JSON.stringify(backup)));
  expect((await exportData()).vocab).toEqual(backup.vocab);
  const row = backup.vocab[0];
  for (const context of [
    { ...row.contexts[0], id: 'wrong' },
    { ...row.contexts[0], source: undefined },
    {
      ...row.contexts[0],
      definition: { kind: 'imported', front: 'chien', back: 'dog', example: 'Le chat dort.', tags: [] },
    },
    { ...row.contexts[0], definition: { kind: 'imported', front: "l'été", back: 'summer', tags: [] } },
  ]) {
    expect(await failure(importData({ ...backup, vocab: [{ ...row, contexts: [context] }] }))).toBeInstanceOf(Error);
    expect((await exportData()).vocab).toEqual(backup.vocab);
  }
});

test('third-kind content is language-independent, uses its own deck only, and offers recognize/produce or just flip', async () => {
  await importVocabularyNotes(prepare('chat\tcat\nchien\tdog').notes, now);
  const rows = (await exportData()).vocab;
  const card = rows.find((row) => row.key === 'chat')!;
  expect(cardContent(card, 'en')).toEqual({ gloss: 'cat', examples: [], deck: 'TEST deck' });
  expect(cardContent(card, 'zh').gloss).toBe('cat');
  const pool = [
    { word: 'chien', gloss: { en: 'dog', zh: 'dog' }, deck: 'TEST deck' },
    { word: 'soleil', gloss: { en: 'sun' }, deck: 'OTHER' },
  ];
  const input = { card, pool, lang: 'en' as const, seed: 'TEST', voiceAvailable: true };
  expect(buildChallenge(input)).toMatchObject({ kind: 'recognize', options: expect.arrayContaining(['cat', 'dog']) });
  expect(buildChallenge({ ...input, pool: [pool[1]] })).toBeUndefined();
  const third = { word: 'arbre', gloss: { en: 'tree' }, deck: 'TEST deck' };
  const fourth = { word: 'soleil', gloss: { en: 'sun' }, deck: 'TEST deck' };
  const shortDeck = buildChallenge({ ...input, pool: [...pool, third] });
  expect(shortDeck?.kind === 'recognize' && shortDeck.options.length).toBe(2);
  const fullDeck = buildChallenge({ ...input, pool: [...pool, third, fourth] });
  expect(fullDeck?.kind === 'recognize' && fullDeck.options.length).toBe(4);
  const introduced = await introduceVocabularyCard(card, { epoch: 0, resetToken: 0, revision: 0 }, now);
  const rated = await rateVocabularyCard(card.key, introduced.tokens, 'TEST', 'remembered', now);
  const mature = { ...rated.row, schedule: { ...rated.row.schedule!, phase: 'review' as const, scheduledDays: 30 } };
  const withExample = prepareVocabularyImport(
    parsePlainText('chat\tcat\tLe chat dort.'),
    { ...columns, example: 2 },
    'TEST deck',
    'en',
    now,
  ).notes[0];
  const learning = {
    ...card,
    contexts: [withExample.context],
    schedule: { ...rated.row.schedule!, phase: 'learning' as const },
  };
  expect(buildChallenge({ ...input, card: learning })).toMatchObject({
    kind: 'cloze',
    options: expect.arrayContaining(['chat', 'chien']),
  });
  expect(buildChallenge({ ...input, card: mature })).toEqual({
    kind: 'produce',
    clue: 'cat',
    expected: 'chat',
    pos: undefined,
  });
});

test('deck regions retain tag labels and count each canonical word once, including removed bookmarks', async () => {
  await importVocabularyNotes(
    prepareVocabularyImport(
      parsePlainText('#tags column:3\nchat\tcat\tpet animal\nchien\tdog\tpet'),
      columns,
      'TEST deck',
      'en',
      now,
    ).notes,
    now,
  );
  const rows = (await exportData()).vocab;
  const regions = summarizeRegions({ rows: rows.map((row) => ({ ...row, bookmarked: false, bookmarkedAt: null })) });
  expect(regions.find((region) => region.id === deckRegionId('TEST deck'))).toMatchObject({
    title: 'TEST deck',
    tags: ['pet', 'animal'],
    counts: { total: 2, unseen: 2 },
  });
  expect(regions.reduce((sum, region) => sum + region.counts.total, 0)).toBe(rows.length);
});
