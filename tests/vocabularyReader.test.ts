/** Reader/AI union persistence, edition identity, strict backup rejection and acquired-audio eligibility. */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import * as access from '../src/services/ai/access';
import * as speech from '../src/utils/speech';
import { freshDb, failure } from './fixtures/storage';
import { testDefinition, testLookup } from './fixtures/vocabulary';
import { testReaderDefinition, testReaderLookup } from './fixtures/vocabularyReader';
import { vocabularyContextKey, vocabularyReaderSourceId } from '../src/services/vocabulary/identity';
import { VocabularyContextSchema, VocabularyDefinitionSchema } from '../src/types/vocabulary';
import { db, exportData, importData } from '../src/storage/db';
import {
  saveVocabularyBookmark,
  removeVocabularyBookmark,
  introduceVocabularyCard,
  rateVocabularyCard,
  getVocabularySnapshot,
  readVocabulary,
  subscribeVocabulary,
} from '../src/storage/vocabulary';
import { protectedTexts, audioKey, normalizeText, clearUnprotectedAudio } from '../src/storage/audio';
const now = 1_000;
beforeEach(freshDb);

for (const readerFirst of [true, false]) {
  test(`AI/reader merge (${readerFirst ? 'reader' : 'AI'} first) retains clicked identity, schedule, history and removed contexts`, async () => {
    const lookup = testReaderLookup();
    const aiLookup = {
      ...testLookup(lookup.word),
      source: { kind: 'article' as const, id: 'test-article', title: 'TEST article' },
    };
    const ai = testDefinition(lookup.word);
    const reader = testReaderDefinition();
    const first = readerFirst
      ? await saveVocabularyBookmark(lookup, reader, undefined, now)
      : await saveVocabularyBookmark(aiLookup, ai, undefined, now);
    expect(first.word).toBe('Test-mots');
    expect(first.key).toBe('test-mots');
    expect(first.bookSource).toBeUndefined();
    const introduced = await introduceVocabularyCard(first, (await getVocabularySnapshot(first.key)).tokens, now);
    const rated = await rateVocabularyCard(first.key, introduced.tokens, 'test-review', 'remembered', now);
    await removeVocabularyBookmark(first.key);
    const removed = (await getVocabularySnapshot(first.key)).row!;
    expect(removed).toEqual({ ...rated.row, bookmarked: false, bookmarkedAt: null });
    const merged = readerFirst
      ? await saveVocabularyBookmark(aiLookup, ai, undefined, now + 1)
      : await saveVocabularyBookmark(lookup, reader, undefined, now + 1);
    expect(merged.contexts).toHaveLength(2);
    expect(merged.schedule).toEqual(rated.row.schedule);
    expect(merged.history).toEqual(rated.row.history);
    expect(merged.introducedAt).toBe(now);
    const again = await saveVocabularyBookmark(
      lookup,
      { ...reader, entry: { ...reader.entry, gloss: { en: 'Changed TEST', zh: '\u6d4b\u8bd5' } } },
      undefined,
      now + 2,
    );
    expect(again).toEqual(merged);
    expect((await readVocabulary(now)).rows).toHaveLength(1);
    expect((await readVocabulary(now)).day.introducedKeys).toEqual(['test-mots']);
    expect(await (await db()).getAll('audio')).toEqual([]);
    expect(await (await db()).getAll('cache')).toEqual([]);
  });
}

test('saving, durable reveal and recall checking never request AI or speech for either definition variant', async () => {
  const ai = spyOn(access, 'getAiAccess').mockImplementation(() => {
    throw new Error('Unexpected TEST AI access');
  });
  const speak = spyOn(speech, 'speakFrench').mockImplementation(() => {
    throw new Error('Unexpected TEST speech');
  });
  const prefetch = spyOn(speech, 'prefetchSpeech').mockImplementation(() => {
    throw new Error('Unexpected TEST prefetch');
  });
  try {
    const rows = [
      await saveVocabularyBookmark(testReaderLookup(), testReaderDefinition(), undefined, now),
      await saveVocabularyBookmark(testLookup(), testDefinition(), undefined, now),
    ];
    for (const row of rows) {
      const introduced = await introduceVocabularyCard(row, (await getVocabularySnapshot(row.key)).tokens, now);
      await rateVocabularyCard(row.key, introduced.tokens, 'TEST explicit recall', 'remembered', now);
    }
    expect(ai).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(prefetch).not.toHaveBeenCalled();
  } finally {
    ai.mockRestore();
    speak.mockRestore();
    prefetch.mockRestore();
  }
});

test('reader contexts distinguish edition, source, normalized sentence and request language, never title', async () => {
  const lookup = testReaderLookup();
  const definition = testReaderDefinition();
  const first = await saveVocabularyBookmark(lookup, definition, undefined, now);
  const retitled = await saveVocabularyBookmark(
    { ...lookup, source: { ...lookup.source!, title: 'Changed TEST title' } },
    definition,
    undefined,
    now + 1,
  );
  expect(retitled).toEqual(first);
  expect(vocabularyContextKey(lookup)).toBe(vocabularyContextKey({ ...lookup, sentence: `  ${lookup.sentence}  ` }));
  await saveVocabularyBookmark({ ...lookup, requestLanguage: 'zh' }, definition);
  await saveVocabularyBookmark({ ...lookup, sentence: 'Test-mots TEST encore.' }, definition);
  const version = 'c'.repeat(64);
  await saveVocabularyBookmark(
    { ...lookup, source: { ...lookup.source!, id: vocabularyReaderSourceId(definition.readerId, version) } },
    { ...definition, version },
  );
  expect((await getVocabularySnapshot(first.key)).row!.contexts).toHaveLength(4);
});

test('uncovered clicked forms reject; an exact authored occurrence binding can cover a token or elided part', async () => {
  const lookup = testReaderLookup();
  const definition = testReaderDefinition();
  expect(await failure(saveVocabularyBookmark({ ...lookup, word: 'test-intruder' }, definition))).toBeInstanceOf(Error);
  const boundLookup = {
    ...lookup,
    word: 'Test-lié',
    sentence: 'Le Test-lié TEST.',
    binding: { ordinal: 1, entryIds: [definition.entry.id] },
  };
  const bound = await saveVocabularyBookmark(boundLookup, definition);
  expect(bound.word).toBe('Test-lié');
  expect(bound.key).toBe('test-lié');
  expect(bound.contexts[0]).not.toHaveProperty('binding');
  const elided = await saveVocabularyBookmark(
    {
      ...boundLookup,
      word: 'Test-lié',
      sentence: 'L’Test-lié TEST.',
      binding: { ordinal: 0, entryIds: [definition.entry.id] },
    },
    definition,
  );
  expect(elided.contexts).toHaveLength(2);
  for (const binding of [
    { ordinal: 0, entryIds: [definition.entry.id] },
    { ordinal: 1, entryIds: ['wrong-test-entry'] },
    { ordinal: 99, entryIds: [definition.entry.id] },
  ])
    expect(await failure(saveVocabularyBookmark({ ...boundLookup, binding }, definition))).toBeInstanceOf(Error);
  expect((await readVocabulary(now)).rows).toHaveLength(1);
});

test('reader saves remain durable-first and retry idempotently after a native commit abort', async () => {
  let notifications = 0;
  const unsubscribe = subscribeVocabulary(() => {
    notifications++;
  });
  // oxlint-disable-next-line typescript/unbound-method -- Restore the receiver-bound native delegate after abort injection.
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (this.name === 'vocab') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    expect(await failure(saveVocabularyBookmark(testReaderLookup(), testReaderDefinition()))).toBeInstanceOf(Error);
    expect((await readVocabulary(now)).rows).toEqual([]);
    expect(notifications).toBe(0);
  } finally {
    IDBObjectStore.prototype.put = put;
    unsubscribe();
  }
  const first = await saveVocabularyBookmark(testReaderLookup(), testReaderDefinition(), undefined, now);
  expect(await saveVocabularyBookmark(testReaderLookup(), testReaderDefinition(), undefined, now + 1)).toEqual(first);
});

test('paired backups round-trip both self-contained variants, including bound forms without any reader service', async () => {
  const lookup = testReaderLookup();
  await saveVocabularyBookmark(lookup, testReaderDefinition(), undefined, now);
  await saveVocabularyBookmark(
    { ...testLookup(lookup.word), sentence: 'AI TEST context.' },
    testDefinition(lookup.word),
    undefined,
    now,
  );
  await saveVocabularyBookmark(
    { ...lookup, word: 'Test-lié', sentence: 'Test-lié TEST.', binding: { ordinal: 0, entryIds: ['test-noun'] } },
    testReaderDefinition(),
    undefined,
    now,
  );
  const backup = await exportData();
  await freshDb();
  await importData(JSON.parse(JSON.stringify(backup)));
  expect((await exportData()).vocab).toEqual(backup.vocab);
  expect((await getVocabularySnapshot('test-mots')).row!.contexts[0].definition).toEqual(testReaderDefinition());
});

test('strict union and malformed edition/sentence snapshots reject atomically, including the removed context analysis shape', async () => {
  const saved = await saveVocabularyBookmark(testReaderLookup(), testReaderDefinition());
  const backup = await exportData();
  const context = saved.contexts[0];
  const definition = testReaderDefinition();
  for (const bad of [
    { kind: 'missing' },
    { ...definition, version: 'bad' },
    { ...definition, readerId: '../bad' },
    { ...definition, entry: { ...definition.entry, gender: undefined } },
    { ...definition, sentenceTranslation: { en: 'Missing TEST Chinese' } },
    { ...definition, sentenceTranslation: { en: 'TEST', zh: 'not Chinese' } },
    { ...definition, analysis: testDefinition().analysis },
    { kind: 'ai' },
    { ...testDefinition(), entry: definition.entry },
  ]) {
    expect(VocabularyDefinitionSchema.safeParse(bad).success).toBe(false);
    expect(
      await failure(importData({ ...backup, vocab: [{ ...saved, contexts: [{ ...context, definition: bad }] }] })),
    ).toBeInstanceOf(Error);
    expect((await exportData()).vocab).toEqual(backup.vocab);
  }
  const { definition: _removed, ...withoutDefinition } = context;
  for (const bad of [
    { ...withoutDefinition, analysis: testDefinition().analysis },
    { ...context, source: undefined },
    { ...context, source: { ...context.source, id: vocabularyReaderSourceId(definition.readerId, 'c'.repeat(64)) } },
    { ...context, sentence: '' },
    { ...context, sentence: '<b>TEST</b>' },
    ...['TEST without punctuation', 'TEST sentence. Another TEST sentence.'].map((sentence) => ({
      ...context,
      sentence,
      id: vocabularyContextKey({ ...context, sentence }),
    })),
  ])
    expect(VocabularyContextSchema.safeParse(bad).success).toBe(false);
  expect(await failure(saveVocabularyBookmark({ ...testReaderLookup(), sentence: '' }, definition))).toBeInstanceOf(
    Error,
  );
});

test('reader acquired-audio protection keeps only clicked word and source sentence; AI examples remain protected', async () => {
  const reader = await saveVocabularyBookmark(testReaderLookup(), testReaderDefinition());
  const ai = await saveVocabularyBookmark(testLookup(), testDefinition());
  const d = await db();
  const expected = new Set(
    [
      reader.word,
      reader.contexts[0].sentence,
      ai.word,
      ai.contexts[0].sentence,
      testDefinition().analysis.usageExamples![0].fr,
    ].map(normalizeText),
  );
  const unrelated = [
    'test-mot-lemma',
    testReaderDefinition().entry.lemma,
    testReaderDefinition().sentenceTranslation.en,
  ];
  for (const text of [...expected, ...unrelated])
    await d.put('audio', {
      key: audioKey('test', 'test', 'test', text),
      text: normalizeText(text),
      provider: 'test',
      model: 'test',
      voice: 'test',
      blob: new Blob(['TEST']),
      bytes: 4,
      lastUsed: 1,
    });
  expect(await protectedTexts()).toEqual(expected);
  await clearUnprotectedAudio();
  expect(new Set((await d.getAll('audio')).map((clip) => clip.text))).toEqual(expected);
  await removeVocabularyBookmark(reader.key);
  expect(await protectedTexts()).not.toContain(normalizeText(reader.word));
});
