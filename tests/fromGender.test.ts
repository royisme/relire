/** Pure noun-drill contract, deterministic grading, metadata boundary and the existing save-only retry seam. */
import { beforeEach, expect, test } from 'bun:test';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import data from '../src/data/noun-gender/pack.json';
import { NounGenderPackSchema } from '../src/types/nounGender';
import { ExerciseUnitSchema, type ExerciseUnit } from '../src/types/exercises';
import { nounGenderDrillMeta } from '../src/types/nounGenderDrill';
import { prepareGenderDrills } from '../src/services/exercises/fromGender';
import { gradeItem } from '../src/services/exercises/grading';
import { emptyAnswer } from '../src/services/exercises/answer';
import { createUnitSaver } from '../src/hooks/useUnitSaver';
import { listUnits, saveUnits } from '../src/storage/exercises';
import { parseExerciseBackup } from '../src/storage/exerciseBackup';
import { failure, freshDb } from './fixtures/storage';

const pack = NounGenderPackSchema.parse(data);
const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
const prepare = () =>
  prepareGenderDrills({
    pack,
    t,
    rng: () => 0.99999,
    makeId: (() => {
      let id = 0;
      return () => `TEST-${++id}`;
    })(),
    now: () => 123,
  });

beforeEach(freshDb);

test('one standalone batch defaults to A1/eight, fresh set/unit IDs, one timestamp and bare noun prompts', () => {
  const units = prepare();
  expect(units).toHaveLength(1);
  const [unit] = units;
  expect(ExerciseUnitSchema.safeParse(unit).success).toBe(true);
  expect(unit).toMatchObject({
    id: 'unit-TEST-2',
    setId: 'TEST-1',
    createdAt: 123,
    level: 'A1',
    section: 'GRAMMAIRE',
    type: 'GENDER_CHECK',
    unitNumber: 1,
    grammarTags: ['gender-number'],
    title: en.nounGender.drill.title,
    instruction: en.nounGender.drill.instruction,
  });
  expect(unit.setTitle).toBe(unit.title);
  expect(unit.items).toHaveLength(8);
  expect(unit.importSource).toBeUndefined();
  expect(unit.readingPassage).toBeUndefined();
  expect(new Set(unit.items.map((item) => item.id)).size).toBe(8);
  unit.items.forEach((item, index) => {
    const noun = pack.nouns.find((noun) => noun.id === item.id)!;
    expect(item.prompt).toBe(noun.lemma);
    expect(item.itemNumber).toBe(index + 1);
    expect(item.expectedAnswer).toBe(noun.gender === 'm' ? 'M' : 'F');
    expect(item.answerSource).toBeUndefined();
    expect(
      gradeItem(
        'GENDER_CHECK',
        item,
        { ...emptyAnswer(item), singleAnswer: String(item.expectedAnswer) },
        { strictAccents: false },
      ),
    ).toMatchObject({ status: 'graded', correct: true });
  });
  const next = prepareGenderDrills({ pack, t });
  const another = prepareGenderDrills({ pack, t });
  expect(next[0].setId).not.toBe(another[0].setId);
  expect(next[0].id).not.toBe(another[0].id);
});

test('sampling without replacement includes exceptions and no-rule nouns; only the longest rule is snapshotted', () => {
  const [unit] = prepareGenderDrills({ pack, t, count: pack.nouns.length, level: 'C1' });
  expect(unit.items).toHaveLength(337);
  expect(new Set(unit.items.map((item) => item.prompt)).size).toBe(337);
  expect(unit.level).toBe('C1');
  const plage = unit.items.find((item) => item.id === 'plage')!;
  expect(plage.expectedAnswer).toBe('F');
  expect(nounGenderDrillMeta(plage.meta)).toEqual({
    source: 'noun-gender',
    nounId: 'plage',
    exception: true,
    rules: [{ id: 'age', percent: (100 * 3091) / 3105, n: 3105 }],
  });
  const noRule = unit.items.find((item) => item.id === 'maison')!;
  expect(nounGenderDrillMeta(noRule.meta)).toMatchObject({ rules: [], exception: false });
  const overlapping = { ...pack, rules: [{ ...pack.rules[0], id: 'te', ending: 'e' }, ...pack.rules] };
  const [all] = prepareGenderDrills({ pack: overlapping, t, count: pack.nouns.length });
  expect(
    nounGenderDrillMeta(all.items.find((item) => item.id === 'voiture')!.meta)?.rules.map((rule) => rule.id),
  ).toEqual(['ure']);
});

test('count must be an integer in the actual pack range; a valid one-item sample works', () => {
  for (const count of [0, -1, 1.5, NaN, Infinity, pack.nouns.length + 1])
    expect(() => prepareGenderDrills({ pack, t, count })).toThrow(t('nounGender.drill.countRange', { max: 337 }));
  expect(prepareGenderDrills({ pack, t, count: 1 })[0].items).toHaveLength(1);
});

test('title/instruction use the supplied locale; feedback text is never stored', () => {
  const [unit] = prepareGenderDrills({ pack, t: i18n.getFixedT('zh') });
  expect(unit.title).toBe(zh.nounGender.drill.title);
  expect(unit.instruction).toBe(zh.nounGender.drill.instruction);
  expect(JSON.stringify(unit.items)).not.toContain('Ending');
});

test('malformed imported structured metadata is rejected, while generic checks remain unchanged', () => {
  const [unit] = prepare();
  const meta = unit.items[0].meta!;
  for (const malformed of [
    { ...meta, rules: null },
    { ...meta, exception: 'yes' },
    { ...meta, nounId: 4 },
    { ...meta, rules: [{ id: 'unknown', percent: 90, n: 30 }] },
    { ...meta, rules: [{ id: 'age', percent: 101, n: 30 }] },
    { ...meta, rules: [{ id: 'age', percent: 90, n: 0 }] },
    { ...meta, rules: [], exception: true },
    {
      ...meta,
      rules: [
        { id: 'age', percent: 90, n: 30 },
        { id: 'te', percent: 90, n: 30 },
      ],
    },
  ]) {
    const bad = { ...unit, items: [{ ...unit.items[0], meta: malformed }] };
    expect(nounGenderDrillMeta(malformed)).toBeUndefined();
    expect(ExerciseUnitSchema.safeParse(bad).success).toBe(false);
    expect(() => parseExerciseBackup({ units: [bad] })).toThrow();
  }
  expect(
    ExerciseUnitSchema.safeParse({ ...unit, items: [{ ...unit.items[0], meta: { source: 'import' } }] }).success,
  ).toBe(true);
  expect(parseExerciseBackup({ units: [unit] }).units).toEqual([unit]);
});

test('a failed storage write retries exactly the prepared sample/IDs/time, without resampling', async () => {
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
});
