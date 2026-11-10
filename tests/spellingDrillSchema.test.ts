/** Spelling-sounds marker provenance: meta schema strictness and the choice/audio refinement; no storage. */
import { expect, test } from 'bun:test';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { prepareSpellingDrill } from '../src/services/exercises/fromSpelling';
import { ExerciseUnitSchema, type ExerciseItem } from '../src/types/exercises';
import { SpellingDrillMetaSchema } from '../src/types/spellingDrill';
import { spellingPack } from './fixtures/spellingSounds';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const prepare = () => {
  let id = 0;
  return prepareSpellingDrill({
    pack: spellingPack(),
    t: i18n.getFixedT('en'),
    rng: seeded(42),
    makeId: () => `TEST-${++id}`,
    now: () => 123,
  });
};

test('spelling-sounds metadata requires the effective choice type and nonblank audio, independently of the listening gate', () => {
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

test('strict provenance rejects every missing/extra field and invalid marker, identifier or policy', () => {
  const [unit] = prepare();
  const meta = unit.items[0].meta!;
  expect(SpellingDrillMetaSchema.safeParse(meta).success).toBe(true);
  const invalid: Record<string, unknown>[] = [{ ...meta, extra: 'TEST' }];
  for (const key of Object.keys(meta)) {
    const missing = { ...meta };
    delete missing[key];
    invalid.push(missing);
  }
  for (const [key, value] of [
    ['source', 'other'],
    ['patternId', 'Bad slug'],
    ['patternId', 'bad_slug'],
    ['patternId', 'H'],
    ['strictAccents', false],
    ['playbackEngine', 'remote'],
  ])
    invalid.push({ ...meta, [String(key)]: value });
  for (const candidate of invalid) {
    expect(SpellingDrillMetaSchema.safeParse(candidate).success).toBe(false);
    if (candidate.source === 'spelling-sounds')
      expect(ExerciseUnitSchema.safeParse({ ...unit, items: [{ ...unit.items[0], meta: candidate }] }).success).toBe(
        false,
      );
  }
});
