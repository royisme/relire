/** Owns the verb and cell statuses of an AI answer against the engine and of a pack row; not the view (conjugationAssemble) or the schema. */
import { describe, expect, test } from 'bun:test';
import { verifyAnswer, verifyPackVerb, type VerifiedVerb } from '../src/services/conjugation/verify';
import { REGULAR_RULES } from '../src/services/conjugation/rules';
import type { ConjugationAnswer } from '../src/types/conjugationAnswer';
import { TENSES, type Verb } from '../src/types/grammarPack';
import { GOLDEN } from './fixtures/grammarPackGolden';
import { answerFromGolden, erAnswer, falloirAnswer, parlerAnswer } from './fixtures/conjugationAnswer';

const cells = (verified: VerifiedVerb, tenses: readonly string[] = TENSES) =>
  tenses.flatMap((tense) => Object.values(verified.tenses[tense as keyof VerifiedVerb['tenses']]));
const statusesOf = (verified: VerifiedVerb, tenses?: readonly string[]) =>
  new Set(cells(verified, tenses).map((cell) => cell.status));
const SIMPLE = ['present', 'imparfait', 'futur', 'conditionnel', 'subjonctif', 'imperatif'];

const lever = (rule: ConjugationAnswer['rule'] = 'er-e-grave') =>
  erAnswer('lever', rule, { plain: 'lev', strong: 'lèv', fut: 'lèver' });

describe('a regular verb whose answer equals the engine', () => {
  test('parler: every simple cell matches and the verb is rule-checked', () => {
    const verified = verifyAnswer(parlerAnswer());
    expect(verified.status).toBe('rule-checked');
    expect(verified.rule).toBe('er-regular');
    expect(statusesOf(verified, SIMPLE)).toEqual(new Set(['match']));
    expect(verified.participles.present?.status).toBe('match');
    expect(Object.values(verified.participles).map((p) => p.status)).toEqual([
      'match',
      'match',
      'match',
      'match',
      'match',
    ]);
    expect(verified.tenses.present['1sg']).toEqual({ lead: 'je', forms: ['parle'], status: 'match' });
  });

  test('passé composé is always ai-only outside the pack, even when its participle matches', () => {
    const verified = verifyAnswer(parlerAnswer());
    expect(verified.tenses.passeCompose['1sg']).toEqual({ lead: 'j’', forms: ['ai parlé'], status: 'ai-only' });
    expect(statusesOf(verified, ['passeCompose'])).toEqual(new Set(['ai-only']));
  });

  test('a stem change the rule really has: lever under er-e-grave', () => {
    const verified = verifyAnswer(lever());
    expect(verified.status).toBe('rule-checked');
    expect(verified.tenses.present['1sg']?.forms).toEqual(['lève']);
  });
});

describe('a difference keeps both forms', () => {
  test('one wrong form: that cell differs, the others match, the verb partly differs', () => {
    const answer = parlerAnswer();
    answer.forms.present['3sg'] = ['parles'];
    const verified = verifyAnswer(answer);
    expect(verified.status).toBe('partly-differs');
    expect(verified.tenses.present['3sg']).toEqual({
      lead: 'il/elle',
      forms: ['parles'],
      status: 'differs',
      ruleForms: ['parle'],
    });
    expect(cells(verified, SIMPLE).filter((cell) => cell.status === 'differs')).toHaveLength(1);
  });

  test('the primary form is compared, not only the set of variants', () => {
    const payer = erAnswer('payer', 'er-yer-i', { plain: 'pay', strong: 'pai', fut: 'paier' });
    payer.forms.present['1sg'] = ['paie', 'paye'];
    expect(verifyAnswer(payer).tenses.present['1sg']?.status).toBe('match');
    payer.forms.present['1sg'] = ['paye', 'paie'];
    const swapped = verifyAnswer(payer).tenses.present['1sg'];
    expect(swapped).toMatchObject({ status: 'differs', forms: ['paye', 'paie'], ruleForms: ['paie', 'paye'] });
  });

  test('a missing or extra variant differs', () => {
    const answer = parlerAnswer();
    answer.forms.present['1sg'] = ['parle', 'parles'];
    expect(verifyAnswer(answer).tenses.present['1sg']?.status).toBe('differs');
  });

  test('a past participle the rule does not give differs and makes the verb partly differ', () => {
    const answer = parlerAnswer();
    answer.participles.past.fp = 'parlés';
    const verified = verifyAnswer(answer);
    expect(verified.participles.fp).toEqual({ form: 'parlés', status: 'differs', ruleForm: 'parlées' });
    expect(verified.status).toBe('partly-differs');
  });

  test('acheter named er-regular with the correct forms differs: the AI’s rule is the one checked', () => {
    const acheter = erAnswer('acheter', 'er-regular', { plain: 'achet', strong: 'achèt', fut: 'achèter' });
    const verified = verifyAnswer(acheter);
    expect(verified.status).toBe('partly-differs');
    expect(verified.tenses.present['1sg']).toEqual({
      lead: 'j’',
      forms: ['achète'],
      status: 'differs',
      ruleForms: ['achete'],
    });
    // Named correctly, the same answer is checked clean.
    const named = verifyAnswer({ ...acheter, rule: 'er-e-grave' });
    expect(named.status).toBe('rule-checked');
    expect(statusesOf(named, SIMPLE)).toEqual(new Set(['match']));
  });
});

describe('the pronominal imperatif keeps its clitic in both forms', () => {
  test('se laver: the view and the rule form carry -toi, -nous, -vous', () => {
    const verified = verifyAnswer(erAnswer('se laver', 'er-regular', { plain: 'lav', strong: 'lav', fut: 'laver' }));
    expect(verified.status).toBe('rule-checked');
    expect(verified.tenses.imperatif['2sg']).toEqual({ lead: '', forms: ['lave-toi'], status: 'match' });
    expect(verified.tenses.imperatif['1pl']?.forms).toEqual(['lavons-nous']);
    const wrong = erAnswer('se laver', 'er-regular', { plain: 'lav', strong: 'lav', fut: 'laver' });
    wrong.forms.imperatif = { '2sg': ['laves'], '1pl': ['lavons'], '2pl': ['lavez'] };
    expect(verifyAnswer(wrong).tenses.imperatif['2sg']).toMatchObject({
      status: 'differs',
      forms: ['laves-toi'],
      ruleForms: ['lave-toi'],
    });
  });
});

describe('ai-only verbs: nothing independent is left to compare with', () => {
  const allAiOnly = (verified: VerifiedVerb) => {
    expect(verified.status).toBe('ai-only');
    expect(statusesOf(verified)).toEqual(new Set(['ai-only']));
    expect(Object.values(verified.participles).every((p) => p.status === 'ai-only')).toBe(true);
    expect(cells(verified).some((cell) => cell.ruleForms !== undefined)).toBe(false);
  };

  test('irregular, even with a perfect table', () => {
    const verified = verifyAnswer(answerFromGolden('aller'));
    allAiOnly(verified);
    expect(verified.rule).toBe('irregular');
  });

  test('a rule misfit by suffix: the rule is discarded', () => {
    for (const rule of ['ir-issons', 'er-cer', 're-regular'] as const) {
      const verified = verifyAnswer({ ...parlerAnswer(), rule });
      allAiOnly(verified);
      expect(verified.rule).toBeUndefined();
    }
  });

  test('a rule that cannot apply makes generateVerb throw: a misfit too', () => {
    // parler ends in -er but its stem has no e to turn into è.
    expect(() => REGULAR_RULES['er-e-grave']('parl')).toThrow('no "e"');
    expect(() => REGULAR_RULES['er-eacute-egrave']('parl')).toThrow('no "é"');
    const verified = verifyAnswer({ ...parlerAnswer(), rule: 'er-e-grave' });
    allAiOnly(verified);
    expect(verified.rule).toBeUndefined();
  });

  test('a verb in -oir has no engine family, whatever -ir rule the AI names', () => {
    for (const infinitive of ['pouvoir', 'devoir', 'voir'])
      for (const rule of ['ir-issons', 'ir-sortir', 'ir-ouvrir'] as const) {
        const base = infinitive.slice(0, -2);
        const verified = verifyAnswer(erAnswer(infinitive, rule, { plain: base, strong: base, fut: `${infinitive}r` }));
        allAiOnly(verified);
        expect(verified.rule).toBeUndefined();
      }
    // A real -ir verb still fits.
    expect(
      verifyAnswer(erAnswer('couvrir', 'ir-ouvrir', { plain: 'couvr', strong: 'couvr', fut: 'couvrir' })).rule,
    ).toBe('ir-ouvrir');
  });

  test('a defective flag from the AI', () => {
    const answer = parlerAnswer();
    answer.defective = 'impersonal';
    for (const tense of ['present', 'imparfait', 'futur', 'conditionnel', 'subjonctif'] as const)
      answer.forms[tense] = { '3sg': answer.forms[tense]['3sg'] };
    delete answer.forms.imperatif;
    allAiOnly(verifyAnswer(answer));
    // Without the flag the same verb is checked.
    expect(verifyAnswer(parlerAnswer()).status).toBe('rule-checked');
  });

  test('an h-initial verb, also behind a reflexive', () => {
    allAiOnly(verifyAnswer(erAnswer('habiter', 'er-regular', { plain: 'habit', strong: 'habit', fut: 'habiter' })));
    allAiOnly(
      verifyAnswer(erAnswer('s’habiller', 'er-regular', { plain: 'habill', strong: 'habill', fut: 'habiller' })),
    );
    expect(verifyAnswer(erAnswer('aimer', 'er-regular', { plain: 'aim', strong: 'aim', fut: 'aimer' })).status).toBe(
      'rule-checked',
    );
  });
});

test('the pronominal flag of the AI cannot change the clitic or the rule forms', () => {
  const lie = {
    ...erAnswer('se laver', 'er-regular', { plain: 'lav', strong: 'lav', fut: 'laver' }),
    pronominal: false,
  };
  const verified = verifyAnswer(lie);
  expect(verified.pronominal).toBe(true);
  expect(verified.status).toBe('rule-checked');
  expect(verified.tenses.imperatif['2sg']).toEqual({ lead: '', forms: ['lave-toi'], status: 'match' });
});

describe('ir-ouvrir: the engine takes the participle from the AI', () => {
  const couvrir = () =>
    erAnswer(
      'couvrir',
      'ir-ouvrir',
      { plain: 'couvr', strong: 'couvr', fut: 'couvrir' },
      {
        participles: { present: 'couvrant', past: { ms: 'couvert', fs: 'couverte', mp: 'couverts', fp: 'couvertes' } },
      },
    );

  test('simple cells and the present participle are compared, past participles and passé composé are ai-only', () => {
    const verified = verifyAnswer(couvrir());
    expect(verified.status).toBe('rule-checked');
    expect(statusesOf(verified, SIMPLE)).toEqual(new Set(['match']));
    expect(verified.participles.present?.status).toBe('match');
    for (const key of ['ms', 'fs', 'mp', 'fp'] as const) expect(verified.participles[key]?.status).toBe('ai-only');
    expect(statusesOf(verified, ['passeCompose'])).toEqual(new Set(['ai-only']));
    expect(verified.tenses.passeCompose['1sg']?.forms).toEqual(['ai couvert']);
  });

  test('a wrong agreement ending cannot be called wrong, only unchecked', () => {
    const answer = couvrir();
    answer.participles.past.fs = 'couvert';
    const verified = verifyAnswer(answer);
    expect(verified.participles.fs?.status).toBe('ai-only');
    expect(verified.status).toBe('rule-checked');
  });
});

describe('a verb in the pack', () => {
  test('every cell and participle is reviewed, from the pack row alone', () => {
    // A row shaped like the pack's (the golden aller with a test provenance); no AI answer is involved.
    const row: Verb = {
      ...GOLDEN.aller,
      prov: {
        origin: 'human',
        checkedAgainst: ['human'],
        status: 'reviewed',
        checkedAt: '2026-10-18',
        reviewedBy: 'TEST ONLY',
      },
    };
    const verified = verifyPackVerb(row);
    expect(verified.status).toBe('pack-reviewed');
    expect(statusesOf(verified)).toEqual(new Set(['reviewed']));
    expect(Object.values(verified.participles).every((p) => p.status === 'reviewed')).toBe(true);
    expect(verified.tenses.passeCompose['1sg']).toMatchObject({
      lead: 'je',
      forms: ['suis allé', 'suis allée'],
      status: 'reviewed',
    });
    expect(Object.keys(verified.tenses.imperatif)).toEqual(['2sg', '1pl', '2pl']);
  });
});

test('a verb used only in the 3sg and named irregular stays ai-only through the whole path', () => {
  const verified = verifyAnswer(falloirAnswer());
  expect(verified.status).toBe('ai-only');
  expect(verified.tenses.imperatif).toEqual({});
});
