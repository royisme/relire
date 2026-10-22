/** Sound-drill sampling, schema/audio contracts, strict grading and ordinary save/backup retries; no providers. */
import { beforeEach, expect, test } from 'bun:test';
import i18next from 'i18next';
import data from '../src/data/minimal-pairs/pairs.json';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { createUnitSaver } from '../src/hooks/useUnitSaver';
import { choicePieces, emptyAnswer } from '../src/services/exercises/answer';
import { preparePairsDrills } from '../src/services/exercises/fromPairs';
import { gradeItem } from '../src/services/exercises/grading';
import { ExerciseUnitSchema, ExtractedUnitSchema, type ExerciseUnit } from '../src/types/exercises';
import { supportsListening } from '../src/types/learningArea';
import { MinimalPairsPackSchema } from '../src/types/minimalPairs';
import { parseExerciseBackup } from '../src/storage/exerciseBackup';
import { listUnits, saveUnits } from '../src/storage/exercises';
import { failure, freshDb } from './fixtures/storage';

const pack = MinimalPairsPackSchema.parse(data);
const contrasts = [...new Set(pack.pairs.map((pair) => pair.contrast))];
const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const t = i18n.getFixedT('en');
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const prepare = (seed = 1) => {
  let id = 0;
  return preparePairsDrills({ pack, contrasts, t, rng: seeded(seed), makeId: () => `TEST-${++id}`, now: () => 123 });
};

beforeEach(freshDb);

test('one standalone Listening set defaults to eight/A1 with fresh batch identity and accepted choice audio', () => {
  const units = prepare();
  expect(units).toHaveLength(1);
  const [unit] = units;
  expect(ExerciseUnitSchema.parse(unit)).toEqual(unit);
  expect(ExtractedUnitSchema.parse(unit).items).toEqual(unit.items);
  expect(unit).toMatchObject({
    id: 'unit-TEST-2',
    setId: 'TEST-1',
    setTitle: en.minimalPairs.drill.title,
    createdAt: 123,
    level: 'A1',
    learningArea: 'listening',
    section: 'COMPRENDRE',
    unitNumber: 1,
    type: 'CHOICE_SELECT',
    grammarTags: ['listening-dictation'],
    title: en.minimalPairs.drill.title,
    instruction: en.minimalPairs.drill.instruction,
  });
  expect(unit.items).toHaveLength(8);
  expect(unit.readingPassage).toBeUndefined();
  expect(unit.importSource).toBeUndefined();
  expect(new Set(unit.items.map((item) => item.id)).size).toBe(8);
  unit.items.forEach((item, index) => {
    const pair = pack.pairs.find((pair) => pair.id === item.id)!;
    expect(item.itemNumber).toBe(index + 1);
    expect(typeof item.expectedAnswer).toBe('string');
    expect(item.audioText).toBe(String(item.expectedAnswer));
    expect([pair.a, pair.b]).toContain(String(item.expectedAnswer));
    const pieces = choicePieces(item.prompt);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ kind: 'group', index: 0 });
    expect(pieces[0].kind === 'group' && [...pieces[0].options].sort()).toEqual([pair.a, pair.b].sort());
    expect(item.meta).toEqual({
      source: 'minimal-pairs',
      contrast: pair.contrast,
      pairId: pair.id,
      strictAccents: true,
    });
    expect(
      gradeItem(
        'CHOICE_SELECT',
        item,
        {
          ...emptyAnswer(item),
          choiceSelections: [String(item.expectedAnswer)],
        },
        { strictAccents: false },
      ),
    ).toMatchObject({ status: 'graded', correct: true });
  });
  const next = preparePairsDrills({ pack, contrasts, t })[0];
  const another = preparePairsDrills({ pack, contrasts, t })[0];
  expect(next.id).not.toBe(another.id);
  expect(next.setId).not.toBe(another.setId);
});

test('seeded sampling is deterministic, without replacement, restricted to selected contrasts, and leaves the pack untouched', () => {
  const before = JSON.stringify(pack);
  expect(prepare(42)).toEqual(prepare(42));
  expect(prepare(42)).not.toEqual(prepare(43));
  const selected = ['y-u', 'b-p'];
  const count = pack.pairs.filter((pair) => selected.includes(pair.contrast)).length;
  const [unit] = preparePairsDrills({ pack, contrasts: selected, count, level: 'C1', t });
  expect(unit.level).toBe('C1');
  expect(unit.items).toHaveLength(count);
  expect(new Set(unit.items.map((item) => item.id)).size).toBe(count);
  expect(unit.items.every((item) => selected.includes(String(item.meta?.contrast)))).toBe(true);
  expect(JSON.stringify(pack)).toBe(before);
});

test('both option orders and both spoken targets occur independently over many seeds', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 100; seed++) {
    const [unit] = preparePairsDrills({ pack, contrasts: ['e-ɛ'], count: 1, t, rng: seeded(seed * 12345) });
    const item = unit.items[0];
    seen.add(`${item.prompt}:${String(item.expectedAnswer)}`);
  }
  expect(seen.size).toBe(4);
});

test('empty/unknown contrasts and invalid or over-pool counts fail with translated errors in either locale', () => {
  for (const language of ['en', 'zh']) {
    const translate = i18n.getFixedT(language);
    expect(() => preparePairsDrills({ pack, contrasts: [], t: translate })).toThrow(
      translate('minimalPairs.drill.pickContrast'),
    );
    expect(() => preparePairsDrills({ pack, contrasts: ['TEST-unknown'], t: translate })).toThrow(
      translate('minimalPairs.drill.unknownContrast', { contrast: 'TEST-unknown' }),
    );
    for (const count of [0, -1, 1.5, NaN, Infinity, 2])
      expect(() => preparePairsDrills({ pack, contrasts: ['e-ɛ'], count, t: translate })).toThrow(
        translate('minimalPairs.drill.countRange', { max: 1 }),
      );
  }
});

test('the reviewed tendency uses the ordinary post-check note field, and accents remain strict with the preference off', () => {
  for (const language of ['en', 'zh'] as const) {
    const [unit] = preparePairsDrills({
      pack,
      contrasts: ['e-ɛ'],
      count: 1,
      t: i18n.getFixedT(language),
      rng: () => 0,
    });
    expect(unit.title).toBe(i18n.t('minimalPairs.drill.title', { lng: language }));
    expect(unit.instruction).toBe(i18n.t('minimalPairs.drill.instruction', { lng: language }));
    const item = unit.items[0];
    expect(item.explanation).toBe(i18n.t('minimalPairs.notes.tendency', { lng: language }));
    expect(item.expectedAnswer).toBe(pack.pairs.find((pair) => pair.id === 'fee-fait')!.a);
    expect(
      gradeItem(
        'CHOICE_SELECT',
        item,
        {
          ...emptyAnswer(item),
          choiceSelections: [String(item.expectedAnswer).normalize('NFD').replace(/\p{M}/gu, '')],
        },
        { strictAccents: false },
      ),
    ).toMatchObject({ status: 'graded', correct: false });
  }
});

test('Listening accepts pack-backed choices with audio, not generic prompt TTS or missing audio', () => {
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

test('new builder and form have no AI or speech imports', async () => {
  for (const file of ['src/services/exercises/fromPairs.ts', 'src/components/practice/PairsDrillForm.tsx']) {
    const source = await Bun.file(file).text();
    expect(source).not.toMatch(/(?:from|import\()\s*['"][^'"]*(?:\/ai(?:\/|['"])|\/speech(?:\/|['"]))/);
  }
});
