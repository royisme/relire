/** Spelling-drill sampling over the real pack and a fixture, silent/distractor invariants and save retries; no providers. */
import { beforeEach, expect, test } from 'bun:test';
import i18next from 'i18next';
import realPackJson from '../src/data/spelling-sounds/patterns.json';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { createUnitSaver } from '../src/hooks/useUnitSaver';
import { choicePieces } from '../src/services/exercises/answer';
import { prepareSpellingDrill } from '../src/services/exercises/fromSpelling';
import { parseExerciseBackup } from '../src/storage/exerciseBackup';
import { listUnits, saveUnits } from '../src/storage/exercises';
import { ExerciseUnitSchema, ExtractedUnitSchema, type ExerciseUnit } from '../src/types/exercises';
import { supportsListening } from '../src/types/learningArea';
import { SpellingSoundsPackSchema, type SpellingSoundsPack } from '../src/types/spellingSounds';
import { spellingPack } from './fixtures/spellingSounds';
import { failure, freshDb } from './fixtures/storage';

const realPack = SpellingSoundsPackSchema.parse(realPackJson);
const fixturePack = spellingPack();
const poolOf = (pack: SpellingSoundsPack) => pack.patterns.filter((pattern) => pattern.group !== 'silent');
const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const t = i18n.getFixedT('en');
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const prepare = (pack = realPack, seed = 1, count?: number) => {
  let id = 0;
  return prepareSpellingDrill({ pack, count, t, rng: seeded(seed), makeId: () => `TEST-${++id}`, now: () => 123 });
};

beforeEach(freshDb);

test('one standalone Listening set defaults to eight/A1 with fresh batch identity and pattern-backed words', () => {
  const units = prepare();
  expect(units).toHaveLength(1);
  const [unit] = units;
  expect(ExerciseUnitSchema.parse(unit)).toEqual(unit);
  expect(ExtractedUnitSchema.parse(unit).items).toEqual(unit.items);
  expect(unit).toMatchObject({
    id: 'unit-TEST-2',
    setId: 'TEST-1',
    setTitle: en.spellingSounds.drill.title,
    createdAt: 123,
    level: 'A1',
    learningArea: 'listening',
    section: 'COMPRENDRE',
    unitNumber: 1,
    type: 'CHOICE_SELECT',
    grammarTags: ['listening-dictation'],
    title: en.spellingSounds.drill.title,
    instruction: en.spellingSounds.drill.instruction,
  });
  expect(unit.readingPassage).toBeUndefined();
  expect(unit.importSource).toBeUndefined();
  expect(unit.items).toHaveLength(8);
  expect(new Set(unit.items.map((item) => item.id)).size).toBe(8);
  unit.items.forEach((item, index) => {
    const pattern = poolOf(realPack).find((row) => row.id === item.meta?.patternId)!;
    expect(item).toMatchObject({
      id: `${pattern.id}-${item.audioText}`,
      type: 'CHOICE_SELECT',
      itemNumber: index + 1,
      expectedAnswer: pattern.spelling,
      audioText: pattern.examples.find((word) => word === item.audioText),
      grammarTag: 'listening-dictation',
    });
    expect(item.explanation).toBeUndefined();
    expect(item.meta).toEqual({
      source: 'spelling-sounds',
      patternId: pattern.id,
      strictAccents: true,
      playbackEngine: 'device',
    });
  });
  const next = prepareSpellingDrill({ pack: realPack, t })[0];
  const another = prepareSpellingDrill({ pack: realPack, t })[0];
  expect(next.id).not.toBe(another.id);
  expect(next.setId).not.toBe(another.setId);
});

test('counts cap at the pairs available, seeded sampling is deterministic and leaves the pack untouched', () => {
  const before = JSON.stringify(realPack);
  const pool = poolOf(realPack);
  expect(prepare(realPack, 42, 1000)[0].items).toHaveLength(pool.length * 4);
  expect(prepare(fixturePack, 42, 100)[0].items).toHaveLength(poolOf(fixturePack).length * 3);
  expect(ExerciseUnitSchema.parse(prepare(fixturePack)[0])).toEqual(prepare(fixturePack)[0]);
  expect(prepare(realPack, 42)).toEqual(prepare(realPack, 42));
  expect(prepare(realPack, 42)).not.toEqual(prepare(realPack, 43));
  const [whole] = prepare(realPack, 42, 1000);
  const heard = whole.items.map((item) => item.audioText);
  const ids = whole.items.map((item) => item.id);
  expect(new Set(heard).size).toBe(heard.length);
  for (const pattern of pool) for (const word of pattern.examples) expect(ids).toContain(`${pattern.id}-${word}`);
  expect(JSON.stringify(realPack)).toBe(before);
});

test('over 200 seeds no silent spelling appears and every distractor differs in sound and hides in no heard word', () => {
  const pool = poolOf(realPack);
  const silent = new Set(
    realPack.patterns.filter((pattern) => pattern.group === 'silent').map((pattern) => pattern.spelling),
  );
  const bySpelling = new Map(pool.map((pattern) => [pattern.spelling, pattern]));
  for (let seed = 1; seed <= 200; seed++) {
    const [unit] = prepare(realPack, seed, 12);
    for (const item of unit.items) {
      const pattern = pool.find((row) => row.id === item.meta?.patternId)!;
      const pieces = choicePieces(item.prompt);
      expect(pieces).toHaveLength(1);
      const options = pieces[0].kind === 'group' ? pieces[0].options : [];
      expect(options).toHaveLength(3);
      expect(new Set(options).size).toBe(3);
      expect(options).toContain(pattern.spelling);
      expect(silent.has(String(item.expectedAnswer))).toBe(false);
      // The pack's word "eau" is its own spelling, so it can only appear as the item's answer.
      if (item.audioText !== item.expectedAnswer) expect(item.prompt).not.toContain(item.audioText);
      const eligible = (other: (typeof pool)[number]) =>
        other.id !== pattern.id &&
        JSON.stringify(other.sound) !== JSON.stringify(pattern.sound) &&
        other.spelling !== pattern.spelling &&
        !item.audioText?.includes(other.spelling);
      const distractors = options.filter((option) => option !== pattern.spelling);
      const sameGroup = pool.filter((other) => eligible(other) && other.group === pattern.group);
      // Same-group spellings are preferred whenever two of them fit the heard word.
      if (sameGroup.length >= 2)
        for (const option of distractors) expect(bySpelling.get(option)!.group).toBe(pattern.group);
      for (const option of distractors) {
        const other = bySpelling.get(option)!;
        expect(JSON.stringify(other.sound)).not.toBe(JSON.stringify(pattern.sound));
        expect(item.audioText).not.toContain(option);
      }
      for (const option of options) expect(silent.has(option)).toBe(false);
    }
  }
});

test('Listening accepts spelling-sound choices with audio, not a plain choice unit without the marker', () => {
  const [unit] = prepare();
  expect(supportsListening(unit)).toBe(true);
  for (const items of [
    unit.items.map((item) => ({ ...item, meta: undefined })),
    unit.items.map((item) => ({ ...item, audioText: '' })),
  ]) {
    expect(supportsListening({ ...unit, items })).toBe(false);
    expect(ExtractedUnitSchema.safeParse({ ...unit, items }).success).toBe(false);
  }
});

test('a failed write retries the same sample/IDs/time through saveUnits and round-trips backup validation', async () => {
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
  failing = false;
  const saved = await saver.run(make);
  expect(prepared).toBe(1);
  expect(saved === first).toBe(true);
  expect(await listUnits()).toEqual(saved!);
  expect(parseExerciseBackup({ units: JSON.parse(JSON.stringify(saved)) }).units).toEqual(saved!);
});
