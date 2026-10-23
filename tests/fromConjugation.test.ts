/**
 * Drill generation from verified verb views (grammar-pack.md Part 1 section 8,
 * "Drills"): schema, determinism, ids, prompts, tag mapping, variants, the
 * per-verb cap, shared batch fields, gradable cells only, accent strictness
 * through `effectiveStrictAccents`, and no import from the AI layer.
 */
import { describe, expect, test } from 'bun:test';
import i18n from '../src/i18n';
import {
  DEFAULT_DRILL_COUNT,
  DEFAULT_DRILL_LEVEL,
  hasGradableCell,
  hasGradableTense,
  prepareConjugationDrills,
} from '../src/services/exercises/fromConjugation';
import { effectiveStrictAccents, gradeItem } from '../src/services/exercises/grading';
import { emptyAnswer } from '../src/services/exercises/answer';
import { verifyAnswer, verifyPackVerb } from '../src/services/conjugation/verify';
import { ExerciseUnitSchema, type ExerciseItem } from '../src/types/exercises';
import type { GrammarTag } from '../src/types/grammar';
import { TENSES, type Tense, type Verb } from '../src/types/grammarPack';
import { GOLDEN } from './fixtures/grammarPackGolden';
import { generate, POUVOIR_SPEC } from './fixtures/grammarPackVerbs';
import { parlerAnswer } from './fixtures/conjugationAnswer';

const t = i18n.t;

/** A pack row of a golden verb with test provenance, as `verifyPackVerb` takes it. */
function packVerb(id: keyof typeof GOLDEN): Verb {
  return {
    ...GOLDEN[id],
    prov: {
      origin: 'human',
      checkedAgainst: ['human'],
      status: 'reviewed',
      checkedAt: '2026-10-18',
      reviewedBy: 'TEST ONLY',
    },
  };
}

/** Deterministic rng (mulberry32) so a seed picks the same cells every run. */
const seededRng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let out = Math.imul(a ^ (a >>> 15), 1 | a);
    out = (out + Math.imul(out ^ (out >>> 7), 61 | out)) ^ out;
    return ((out ^ (out >>> 14)) >>> 0) / 4294967296;
  };
};

const make = (over: Partial<Parameters<typeof prepareConjugationDrills>[0]> = {}) => {
  let id = 0;
  // A clock that moves, so a batch that read it per unit could not share one timestamp.
  let tick = 1_700_000_000_000;
  return prepareConjugationDrills({
    verbs: [verifyPackVerb(packVerb('aller'))],
    tenses: ['present'],
    level: 'A2',
    packVersion: '0.1.0',
    rng: seededRng(7),
    makeId: () => `id-${++id}`,
    now: () => ++tick,
    t,
    ...over,
  });
};

test('one unit per selected tense, each valid, numbered, tagged and named after its tense', () => {
  const units = make({ tenses: [...TENSES] });
  expect(units).toHaveLength(TENSES.length);
  const setId = units[0]!.setId;
  for (const [index, unit] of units.entries()) {
    expect(ExerciseUnitSchema.safeParse(unit).success).toBe(true);
    expect(unit.id).toBe(`${setId}:${TENSES[index]}`);
    expect(unit.unitNumber).toBe(index + 1);
    expect(unit.section).toBe('CONJUGAISON');
    expect(unit.learningArea).toBe('grammar');
    expect(unit.type).toBe('WORD_TRANSFORM');
    expect(unit.setTitle).toBeTypeOf('string');
    expect(unit.createdAt).toBe(1_700_000_000_001); // one read, shared by every unit
    expect(unit.level).toBe('A2');
  }
});

test('deterministic with a seeded rng: the same inputs build the same batch', () => {
  const first = make({ tenses: [...TENSES] });
  const second = make({ tenses: [...TENSES] });
  expect(second).toEqual(first);
  const other = make({ tenses: [...TENSES], rng: seededRng(8) });
  expect(JSON.stringify(other)).not.toBe(JSON.stringify(first));
});

test('item ids are unique and itemNumber is 1-based', () => {
  const units = make({ tenses: [...TENSES], perUnit: 6, maxPerVerb: 6 });
  for (const unit of units) {
    expect(new Set(unit.items.map((item) => item.id)).size).toBe(unit.items.length);
    expect(unit.items.map((item) => item.itemNumber)).toEqual(unit.items.map((_, index) => index + 1));
  }
  const present = units.find((unit) => unit.id.endsWith(':present'))!;
  expect(present.items[0]!.id).toMatch(/^aller:present:/);
});

test('every prompt names the tense (and the imperative names the person) on its own', () => {
  const units = make({ tenses: [...TENSES], perUnit: 6, maxPerVerb: 6 });
  for (const tense of TENSES) {
    const unit = units.find((candidate) => candidate.id.endsWith(`:${tense}`))!;
    for (const item of unit.items) {
      expect(item.prompt).toContain(`(aller), ${t(`conjugation.tenses.${tense}.name`)}`);
      if (tense === 'imperatif') expect(item.prompt).toMatch(/, (you|we)/);
    }
  }
  const etre = make({
    verbs: [verifyPackVerb(packVerb('etre'))],
    tenses: ['passeCompose'],
    perUnit: 6,
    maxPerVerb: 6,
  })[0]!;
  // An elided lead takes no space before the dots; the attempt log stores only the prompt.
  expect(etre.items.some((item) => item.prompt.startsWith('j’... (être)'))).toBe(true);
});

test('the prompts follow the interface language at creation', async () => {
  await i18n.changeLanguage('zh');
  try {
    const [unit] = make();
    expect(unit.instruction).toBe('按要求写出动词的正确形式。');
    expect(unit.title).toBe('动词变位：现在时');
    expect(unit.items.every((item) => item.prompt.includes('现在时'))).toBe(true);
  } finally {
    await i18n.changeLanguage('en');
  }
});

test('the tense tag mapping', () => {
  const tags: Record<Tense, GrammarTag> = {
    present: 'present',
    passeCompose: 'passe-compose',
    imparfait: 'imparfait',
    plusQueParfait: 'plus-que-parfait',
    futur: 'future',
    futurAnterieur: 'future',
    conditionnel: 'conditional',
    conditionnelPasse: 'conditional',
    subjonctif: 'subjunctive',
    subjonctifPasse: 'subjunctive',
    imperatif: 'imperative',
  };
  const units = make({ tenses: [...TENSES], perUnit: 6, maxPerVerb: 6 });
  for (const tense of TENSES) {
    const unit = units.find((candidate) => candidate.id.endsWith(`:${tense}`))!;
    expect(unit.grammarTags).toEqual([tags[tense]]);
    expect(unit.items.every((item) => item.grammarTag === tags[tense])).toBe(true);
  }
});

test('variants land in acceptableAnswers and meta carries the provenance', () => {
  const [unit] = make({ tenses: ['passeCompose'], perUnit: 6, maxPerVerb: 6 });
  const first = unit.items.find((item) => item.id === 'aller:passeCompose:1sg')!;
  expect(first.expectedAnswer).toBe('suis allé');
  expect(first.acceptableAnswers).toEqual(['suis allée']);
  expect(first.meta).toMatchObject({
    source: 'grammar-pack',
    verification: 'reviewed',
    packVersion: '0.1.0',
    verbId: 'aller',
    tense: 'passeCompose',
    person: '1sg',
    strictAccents: true,
  });
  expect(first).not.toHaveProperty('answerSource');
  expect(first).not.toHaveProperty('explanation');
});

test('the set title lists a few verbs and counts the rest', () => {
  const verbs = (['aller', 'etre', 'avoir', 's-appeler'] as const).map((id) => verifyPackVerb(packVerb(id)));
  const [unit] = make({ verbs, tenses: ['present'] });
  expect(unit.setTitle).toBe('Conjugation: aller, être, avoir and 1 more');
});

test('at most maxPerVerb items per verb in one unit, fewer than perUnit when the pool is smaller', () => {
  const [capped] = make({ perUnit: 8, maxPerVerb: 2 });
  expect(capped.items).toHaveLength(2);
  const verbs = [verifyPackVerb(packVerb('aller')), verifyPackVerb(packVerb('etre'))];
  const [shared] = make({ verbs, perUnit: 8, maxPerVerb: 2 });
  expect(shared.items).toHaveLength(4);
  for (const verb of ['aller', 'être'])
    expect(shared.items.filter((item) => item.meta?.verbId === verb)).toHaveLength(2);
  const [small] = make({ tenses: ['imperatif'], perUnit: 8, maxPerVerb: 3 });
  expect(small.items).toHaveLength(3); // the imperative has three persons
});

test('only reviewed and match cells become items', () => {
  const differs = parlerAnswer();
  differs.forms.present['3sg'] = ['parles']; // one wrong form: that cell differs, the verb partly differs
  const verbs = [
    verifyPackVerb(packVerb('aller')),
    verifyAnswer(differs),
    verifyAnswer({ ...parlerAnswer(), rule: 'irregular' }), // ai-only throughout
  ];
  const [unit] = make({ verbs, tenses: ['present'], perUnit: 24, maxPerVerb: 6 });
  expect(unit.items).toHaveLength(11); // 6 reviewed + 5 match; the differs and ai-only cells never appear
  for (const item of unit.items) expect(['reviewed', 'match']).toContain(String(item.meta?.verification));
  expect(unit.items.some((item) => item.meta?.verbId === 'parler' && item.meta?.person === '3sg')).toBe(false);
  const bySource = new Set(unit.items.map((item) => item.meta?.source));
  expect(bySource).toEqual(new Set(['grammar-pack', 'conjugation-engine']));
});

test('a tense whose cells are all ungradable yields no unit', () => {
  // Outside the pack the passé composé is always ai-only (Part 3 F4).
  expect(make({ verbs: [verifyAnswer(parlerAnswer())], tenses: ['passeCompose'] })).toEqual([]);
});

test('a noImperative verb has no imperative cells, drill or unit, and its other tenses still drill', () => {
  const verb = verifyPackVerb({ ...generate(POUVOIR_SPEC).verb, prov: packVerb('aller').prov });
  expect(verb.noImperative).toBe(true);
  // The table consumers (ConjugationResult, WordConjugation) filter on exactly this empty record.
  expect(verb.tenses.imperatif).toEqual({});
  expect(hasGradableTense(verb, 'imperatif')).toBe(false);
  expect(hasGradableTense(verb, 'present')).toBe(true);
  expect(hasGradableCell(verb)).toBe(true);
  expect(make({ verbs: [verb], tenses: ['imperatif'] })).toEqual([]);
  const units = make({ verbs: [verb], tenses: [...TENSES] });
  expect(units).toHaveLength(TENSES.length - 1);
  expect(units.some((unit) => unit.id.endsWith(':imperatif'))).toBe(false);
});

describe('the Conjugation page button', () => {
  test('a pack verb and a rule-checked verb have cells to ask; an ai-only verb has none', () => {
    expect(hasGradableCell(verifyPackVerb(packVerb('aller')))).toBe(true);
    expect(hasGradableCell(verifyAnswer(parlerAnswer()))).toBe(true);
    expect(hasGradableCell(verifyAnswer({ ...parlerAnswer(), rule: 'irregular' }))).toBe(false);
  });

  test('one displayed verb, every tense, the default level and size, one set', () => {
    const units = make({
      verbs: [verifyPackVerb(packVerb('aller'))],
      tenses: [...TENSES],
      level: DEFAULT_DRILL_LEVEL,
      perUnit: DEFAULT_DRILL_COUNT,
    });
    expect(units).toHaveLength(TENSES.length);
    expect(new Set(units.map((unit) => unit.setId)).size).toBe(1);
    expect(units.map((unit) => unit.level)).toEqual(Array(TENSES.length).fill('A2'));
    // One verb: the per-verb cap of 2 decides the size of every unit.
    expect(units.map((unit) => unit.items.length)).toEqual(Array(TENSES.length).fill(2));
  });

  test('a verb of which only some tenses can be asked yields only those units', () => {
    // Outside the pack the passé composé is ai-only, so the other six tenses remain.
    const units = make({ verbs: [verifyAnswer(parlerAnswer())], tenses: [...TENSES] });
    expect(units.map((unit) => unit.grammarTags[0])).not.toContain('passe-compose');
    expect(units).toHaveLength(6);
  });
});

describe('effectiveStrictAccents', () => {
  const drill = (item: ExerciseItem) => ({ ...emptyAnswer(item), singleAnswer: 'suis alle' });

  test('meta true wins over a false setting; a true setting stays true', () => {
    expect(effectiveStrictAccents({ meta: { strictAccents: true } }, { strictAccents: false })).toBe(true);
    expect(effectiveStrictAccents({ meta: { strictAccents: true } }, { strictAccents: true })).toBe(true);
    expect(effectiveStrictAccents({ meta: {} }, { strictAccents: true })).toBe(true);
    expect(effectiveStrictAccents({}, { strictAccents: false })).toBe(false);
  });

  test('gradeItem grades a drill item with accents even when the preference is off', () => {
    const [unit] = make({ tenses: ['passeCompose'], perUnit: 6, maxPerVerb: 6 });
    const item = unit.items.find((candidate) => candidate.id === 'aller:passeCompose:1sg')!;
    expect(gradeItem('WORD_TRANSFORM', item, drill(item), { strictAccents: false }).status).toBe('graded');
    expect(gradeItem('WORD_TRANSFORM', item, drill(item), { strictAccents: false })).toMatchObject({
      correct: false,
    });
    expect(
      gradeItem('WORD_TRANSFORM', { ...item, meta: undefined }, drill(item), { strictAccents: false }),
    ).toMatchObject({ correct: true });
  });
});

test('the drill module imports nothing from the AI layer', async () => {
  const source = await Bun.file('src/services/exercises/fromConjugation.ts').text();
  expect(source.includes('services/ai')).toBe(false);
  expect(source.includes('../ai')).toBe(false);
});
