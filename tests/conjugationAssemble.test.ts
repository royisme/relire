/** Owns the view built from an AI answer and the infinitive helpers; not verification statuses (conjugationVerify) or the schema. */
import { describe, expect, test } from 'bun:test';
import { assembleVerb, engineBase } from '../src/services/conjugation/assemble';
import { engineInfinitive } from '../src/services/conjugation/infinitive';
import { generateVerb } from '../src/services/conjugation/generate';
import { GOLDEN } from './fixtures/grammarPackGolden';
import { answerFromGolden, erAnswer, falloirAnswer, parlerAnswer } from './fixtures/conjugationAnswer';

describe('engineInfinitive', () => {
  test("s'habiller and s’habiller give the same engine input, and the engine reads it as pronominal", () => {
    expect(engineInfinitive("s'habiller")).toBe('s’habiller');
    expect(engineInfinitive('s’habiller')).toBe('s’habiller');
    expect(engineInfinitive('s‘habiller')).toBe('s’habiller');
    const spec = {
      id: 'x',
      infinitive: engineInfinitive("s'habiller"),
      base: 'habill',
      rule: 'er-regular',
      aux: 'etre',
    } as const;
    expect(generateVerb(spec, {}).verb.pronominal).toBe(true);
    // The unfolded form would not be pronominal: this is why the fold is needed.
    expect(generateVerb({ ...spec, infinitive: "s'habiller" }, {}).verb.pronominal).toBe(false);
  });

  test('lowercase: Parler and parler are one verb', () => {
    expect(engineInfinitive('Parler')).toBe('parler');
    expect(engineInfinitive("S'Habiller")).toBe('s’habiller');
  });

  test('NFC, trim and single spaces', () => {
    expect(engineInfinitive('  se   lever ')).toBe('se lever');
    // e plus a combining circumflex becomes the single character ê.
    expect(engineInfinitive('e\u0302tre')).toBe('être');
  });
});

describe('engineBase', () => {
  test('drops the pronoun and the ending', () => {
    expect(engineBase('parler')).toBe('parl');
    expect(engineBase('se lever')).toBe('lev');
    expect(engineBase('s’habiller')).toBe('habill');
    expect(engineBase('finir')).toBe('fin');
    expect(engineBase('vendre')).toBe('vend');
  });
  test('is undefined without -er, -ir or -re', () => {
    expect(engineBase('abc')).toBeUndefined();
  });
});

describe('assembleVerb composes what the AI is never asked for', () => {
  for (const id of ['aller', 's-appeler'] as const) {
    test(`${id}: leads, passé composé with agreement, imperatif clitics equal the hand-typed golden`, () => {
      const view = assembleVerb(answerFromGolden(id));
      const { id: _id, ...golden } = GOLDEN[id];
      expect(view.tenses).toEqual(golden.tenses);
      expect(view.participles).toEqual(golden.participles);
      expect(view).toMatchObject({ infinitive: golden.infinitive, pronominal: golden.pronominal, aux: golden.aux });
    });
  }

  test('the reflexive carries the elision and the clitic is hyphenated', () => {
    const view = assembleVerb(answerFromGolden('s-appeler'));
    expect(view.tenses.present['1sg']).toEqual({ lead: 'je m’', forms: ['appelle'] });
    expect(view.tenses.imperatif?.['2sg']).toEqual({ lead: '', forms: ['appelle-toi'] });
  });

  test('an irregular verb needs no base and no generator', () => {
    // aller has rule irregular and no base: generateVerb would throw for it, assembleVerb must not.
    expect(() => generateVerb({ id: 'x', infinitive: 'aller', rule: 'irregular', aux: 'etre' }, {})).toThrow();
    expect(assembleVerb(answerFromGolden('aller')).tenses.passeCompose['1pl']?.forms).toEqual([
      'sommes allés',
      'sommes allées',
    ]);
  });

  test('a rule misfit still gets a view: the rule is only a claim', () => {
    const parler = parlerAnswer();
    const misfit = assembleVerb({ ...parler, rule: 'ir-sortir' });
    expect(misfit.tenses).toEqual(assembleVerb(parler).tenses);
    expect(misfit.tenses.present['1sg']).toEqual({ lead: 'je', forms: ['parle'] });
  });

  test('a verb used only in the 3sg: il, one cell per tense, no imperatif', () => {
    const view = assembleVerb(falloirAnswer());
    expect(view.tenses.present).toEqual({ '3sg': { lead: 'il', forms: ['faut'] } });
    expect(view.tenses.subjonctif['3sg']).toEqual({ lead: 'qu’il', forms: ['faille'] });
    expect(view.tenses.passeCompose['3sg']).toEqual({ lead: 'il', forms: ['a fallu'] });
    expect(view.tenses.imperatif).toBeUndefined();
    expect(view.defective).toBe('impersonal');
  });

  test('an aspirated h blocks the elision, a mute h allows it', () => {
    const hurler = erAnswer('hurler', 'er-regular', { plain: 'hurl', strong: 'hurl', fut: 'hurler' });
    expect(assembleVerb({ ...hurler, hAspire: true }).tenses.present['1sg']?.lead).toBe('je');
    expect(assembleVerb(hurler).tenses.present['1sg']?.lead).toBe('j’');
    // false means absent.
    expect(assembleVerb({ ...hurler, hAspire: false }).tenses.present['1sg']?.lead).toBe('j’');
  });

  test('pronominal comes from the infinitive, never from the AI flag', () => {
    const lie = {
      ...erAnswer('se laver', 'er-regular', { plain: 'lav', strong: 'lav', fut: 'laver' }),
      pronominal: false,
    };
    const view = assembleVerb(lie);
    expect(view.pronominal).toBe(true);
    expect(view.tenses.present['1sg']).toEqual({ lead: 'je me', forms: ['lave'] });
    expect(view.tenses.imperatif?.['2sg']?.forms).toEqual(['lave-toi']);
    const other = assembleVerb({ ...parlerAnswer(), pronominal: true });
    expect(other.pronominal).toBe(false);
    expect(other.tenses.present['1sg']).toEqual({ lead: 'je', forms: ['parle'] });
    expect(other.tenses.imperatif?.['2sg']?.forms).toEqual(['parle']);
  });

  test('passé composé takes the AI participles, not a derivation', () => {
    const answer = parlerAnswer();
    answer.participles.past = { ms: 'x', fs: 'y', mp: 'z', fp: 'w' };
    expect(assembleVerb(answer).tenses.passeCompose['1sg']?.forms).toEqual(['ai x']);
    answer.aux = 'etre';
    expect(assembleVerb(answer).tenses.passeCompose['3pl']?.forms).toEqual(['sont z', 'sont w']);
  });
});
