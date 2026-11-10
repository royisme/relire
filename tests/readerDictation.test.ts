/** Reader dictation preparation, provenance validation and save-only retry with invented TEST reader content. */
import { beforeEach, expect, test } from 'bun:test';
import i18next from 'i18next';
import { contentHash } from '../scripts/graded-readers/gateInputs';
import { createUnitSaver } from '../src/hooks/useUnitSaver';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { prepareReaderDictation } from '../src/services/exercises/fromReader';
import { parseExerciseBackup } from '../src/storage/exerciseBackup';
import { listUnits, saveUnits } from '../src/storage/exercises';
import { ExerciseUnitSchema, type ExerciseItem, type ExerciseUnit } from '../src/types/exercises';
import { PublishedReaderSchema } from '../src/types/gradedReader';
import { ReaderDictationMetaSchema } from '../src/types/readerDictation';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { failure, freshDb } from './fixtures/storage';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const reader = publishedReaderFixture();
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
function prepare(language = 'en', count?: number, source = reader, seed = 42) {
  let id = 0;
  return prepareReaderDictation({
    reader: source,
    count,
    language,
    t: i18n.getFixedT(language),
    rng: seeded(seed),
    makeId: () => `TEST-${++id}`,
    now: () => 123,
  });
}

beforeEach(freshDb);

test('one standalone Listening unit parses and snapshots translations, French audio and edition provenance', () => {
  expect(PublishedReaderSchema.parse(reader)).toEqual(reader);
  for (const language of ['en', 'zh'] as const) {
    const units = prepare(language);
    expect(units).toHaveLength(1);
    const [unit] = units;
    expect(ExerciseUnitSchema.parse(unit)).toEqual(unit);
    expect(unit).toMatchObject({
      id: 'unit-TEST-2',
      setId: 'TEST-1',
      setTitle: reader.body.title.fr,
      createdAt: 123,
      level: reader.body.level,
      learningArea: 'listening',
      section: 'COMPRENDRE',
      unitNumber: 1,
      type: 'NUMBER_DICTATION',
      grammarTags: ['listening-dictation'],
      title: i18n.t('readerDictation.title', { lng: language }),
      instruction: i18n.t('readerDictation.instruction', { lng: language }),
    });
    expect(unit.readingPassage).toBeUndefined();
    expect(unit.importSource).toBeUndefined();
    expect(unit.items).toHaveLength(reader.body.sentences.length);
    unit.items.forEach((item, index) => {
      const sentence = reader.body.sentences[index];
      expect(item).toMatchObject({
        id: sentence.id,
        type: 'NUMBER_DICTATION',
        itemNumber: index + 1,
        prompt: sentence.translation[language],
        audioText: sentence.fr,
        expectedAnswer: sentence.fr,
        grammarTag: 'listening-dictation',
      });
      for (const other of reader.body.sentences) expect(item.prompt).not.toContain(other.fr);
      expect(item.meta).toEqual({
        source: 'reader-dictation',
        readerId: reader.body.id,
        version: reader.version,
        sentenceId: sentence.id,
        strictAccents: true,
        ignoreSentencePunctuation: true,
        playbackEngine: 'device',
      });
    });
  }
  const next = prepareReaderDictation({ reader, language: 'en', t: i18n.getFixedT('en') })[0];
  const another = prepareReaderDictation({ reader, language: 'en', t: i18n.getFixedT('en') })[0];
  expect(next.id).not.toBe(another.id);
  expect(next.setId).not.toBe(another.setId);
});

test('default cap is six, counts clamp, seeded sampling keeps reader order without replacement or mutation', () => {
  const longer = publishedReaderFixture();
  longer.body.sentences = Array.from({ length: 9 }, (_, index) => ({
    ...reader.body.sentences[index % reader.body.sentences.length],
    id: `s${index + 1}`,
  }));
  longer.version = longer.review.contentHash = contentHash(longer.body);
  expect(PublishedReaderSchema.safeParse(longer).success).toBe(true);
  const before = JSON.stringify(longer);
  const [unit] = prepare('en', undefined, longer);
  expect(unit.items).toHaveLength(6);
  expect(prepare('en', undefined, longer)).toEqual([unit]);
  expect(prepare('en', undefined, longer, 43)).not.toEqual([unit]);
  const ids = unit.items.map((item) => item.id);
  expect(new Set(ids).size).toBe(6);
  expect(ids).toEqual(
    longer.body.sentences.filter((sentence) => ids.includes(sentence.id)).map((sentence) => sentence.id),
  );
  expect(prepare('en', 100, longer)[0].items).toHaveLength(9);
  expect(prepare('en', 2, longer)[0].items).toHaveLength(2);
  expect(prepare('en', 100)[0].items).toHaveLength(3);
  expect(JSON.stringify(longer)).toBe(before);
});

test('a published reader cannot contain fewer than three sentences', () => {
  for (const count of [0, 1, 2]) {
    const invalid = publishedReaderFixture();
    invalid.body.sentences = invalid.body.sentences.slice(0, count);
    expect(PublishedReaderSchema.safeParse(invalid).success).toBe(false);
  }
});

test('reader metadata requires the effective dictation type and nonblank audio, independently of the listening gate', () => {
  const [unit] = prepare();
  const valid = (patch: Partial<ExerciseItem>, type = unit.type) =>
    ExerciseUnitSchema.safeParse({
      ...unit,
      learningArea: 'grammar',
      type,
      items: [{ ...unit.items[0], ...patch }],
    }).success;
  expect(valid({})).toBe(true);
  expect(valid({ type: 'WORD_TRANSFORM' })).toBe(false);
  expect(valid({ type: undefined }, 'WORD_TRANSFORM')).toBe(false);
  expect(valid({ type: undefined })).toBe(true);
  for (const audioText of [undefined, '', '   ']) expect(valid({ audioText })).toBe(false);
});

test('strict provenance rejects every missing/extra field and invalid marker, identifiers, version or policy', () => {
  const [unit] = prepare();
  const meta = unit.items[0].meta!;
  const invalid: Record<string, unknown>[] = [{ ...meta, extra: 'TEST' }];
  for (const key of Object.keys(meta)) {
    const missing = { ...meta };
    delete missing[key];
    invalid.push(missing);
  }
  for (const [key, value] of [
    ['source', 'other'],
    ['readerId', 'Bad slug'],
    ['sentenceId', 'bad_slug'],
    ['sentenceId', 'title'],
    ['version', 'a'.repeat(63)],
    ['version', 'A'.repeat(64)],
    ['strictAccents', false],
    ['ignoreSentencePunctuation', false],
    ['playbackEngine', 'remote'],
  ])
    invalid.push({ ...meta, [String(key)]: value });
  for (const candidate of invalid) {
    expect(ReaderDictationMetaSchema.safeParse(candidate).success).toBe(false);
    if (candidate.source === 'reader-dictation')
      expect(ExerciseUnitSchema.safeParse({ ...unit, items: [{ ...unit.items[0], meta: candidate }] }).success).toBe(
        false,
      );
  }
});

test('a failed save retries the same prepared sample/IDs/time through saveUnits and backup validation', async () => {
  let failing = true;
  let prepared = 0;
  let first: ExerciseUnit[] | undefined;
  const saver = createUnitSaver(async (units) => {
    if (failing) {
      first = units;
      throw new Error('TEST disk full');
    }
    expect(units === first).toBe(true);
    await saveUnits(units);
  });
  const make = () => {
    prepared++;
    return prepare();
  };
  expect(((await failure(saver.run(make))) as Error).message).toBe('TEST disk full');
  expect(await listUnits()).toEqual([]);
  failing = false;
  const saved = await saver.run(make);
  expect(prepared).toBe(1);
  expect(saved === first).toBe(true);
  expect(await listUnits()).toEqual(saved!);
  expect(parseExerciseBackup({ units: JSON.parse(JSON.stringify(saved)) }).units).toEqual(saved!);
});
