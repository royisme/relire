/** Owns the answer contract of the conjugateVerb task: what the schema accepts, rejects and folds; not the task, the engine or the prompt. */
import { describe, expect, test } from 'bun:test';
import { InvalidAnswerError } from '../src/services/ai/errors';
import { parseAnswer } from '../src/services/ai/validate';
import {
  ConjugationAnswerSchema,
  foldAnswerApostrophes,
  foldApostrophes,
  type ConjugationAnswer,
} from '../src/types/conjugationAnswer';
import { answerFromGolden, erAnswer, falloirAnswer, parlerAnswer } from './fixtures/conjugationAnswer';

/** The schema's reasons, one `path: message` per issue. */
const reasons = (value: unknown) => {
  const result = ConjugationAnswerSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('what the schema accepts', () => {
  test('a regular verb, an irregular one and a pronominal one', () => {
    expect(reasons(parlerAnswer())).toEqual([]);
    expect(reasons(answerFromGolden('aller'))).toEqual([]);
    expect(reasons(answerFromGolden('s-appeler'))).toEqual([]);
  });

  test('a verb used only in the 3sg needs no imperatif and no present participle', () => {
    expect(reasons(falloirAnswer())).toEqual([]);
  });

  test('variants, hAspire true and an English gloss with an apostrophe', () => {
    const answer = parlerAnswer();
    answer.forms.present['1sg'] = ['parle', 'parles'];
    answer.hAspire = true;
    answer.examples.present.gloss = "I don't speak.";
    expect(reasons(answer)).toEqual([]);
  });

  test('the rule may be irregular or any of the eleven families, nothing else', () => {
    expect(reasons({ ...parlerAnswer(), rule: 'irregular' })).toEqual([]);
    expect(reasons({ ...parlerAnswer(), rule: 'er-ger' })).toEqual([]);
    expect(reasons({ ...parlerAnswer(), rule: 'er-made-up' }).join()).toContain('rule');
  });
});

describe('what the schema rejects, with readable reasons', () => {
  const rejected = (change: (answer: ConjugationAnswer) => void) => {
    const answer = parlerAnswer();
    change(answer);
    return reasons(answer);
  };

  test('a straight apostrophe in French text', () => {
    expect(rejected((a) => (a.examples.present.fr = "J'en parle."))).toEqual([
      'examples.present.fr: use the typographic apostrophe U+2019',
    ]);
    expect(rejected((a) => (a.forms.present['1sg'] = ["l'ai"]))).toEqual([
      'forms.present.1sg.0: use the typographic apostrophe U+2019',
    ]);
  });

  test('a form that is not NFC', () => {
    expect(rejected((a) => (a.participles.past.ms = 'parlé'))).toEqual(['participles.past.ms: string is not NFC']);
  });

  test('a duplicate form in one cell', () => {
    expect(rejected((a) => (a.forms.present['2sg'] = ['parles', 'parles']))).toEqual([
      'forms.present.2sg: duplicate form',
    ]);
  });

  test('an empty form or gloss', () => {
    expect(rejected((a) => (a.forms.futur['1sg'] = [' ']))).not.toEqual([]);
    expect(rejected((a) => (a.examples.futur.gloss = ''))).not.toEqual([]);
  });

  test('a missing person, and a person a defective verb does not have', () => {
    expect(rejected((a) => delete a.forms.subjonctif['3pl'])).toEqual(['forms.subjonctif.3pl: cell is missing']);
    const impersonal = falloirAnswer();
    impersonal.forms.present['2sg'] = ['fautes'];
    expect(reasons(impersonal)).toEqual(['forms.present.2sg: cell is not allowed']);
  });

  test('the imperatif is present exactly when the verb is not defective', () => {
    expect(rejected((a) => delete a.forms.imperatif)).toEqual(['forms.imperatif: imperatif is missing']);
    const impersonal = falloirAnswer();
    impersonal.forms.imperatif = { '2sg': ['x'], '1pl': ['x'], '2pl': ['x'] };
    expect(reasons(impersonal)).toEqual(['forms.imperatif: a defective verb has no imperatif']);
    expect(rejected((a) => delete a.examples.imperatif)).toEqual(['examples.imperatif: example is missing']);
  });

  test('a pronominal verb with avoir, and a missing present participle', () => {
    const pronominal = erAnswer(
      'se laver',
      'er-regular',
      { plain: 'lav', strong: 'lav', fut: 'laver' },
      { aux: 'avoir' },
    );
    expect(reasons(pronominal)).toEqual(['aux: a pronominal verb takes être']);
    expect(rejected((a) => delete a.participles.present)).toEqual([
      'participles.present: present participle is missing',
    ]);
  });

  test('hAspire may be false, which means the same as absent', () => {
    expect(rejected((a) => (a.hAspire = false))).toEqual([]);
  });

  test('pronominal must agree with the infinitive, in both directions', () => {
    const message = 'pronominal: pronominal must be true exactly when the infinitive starts with se or s’';
    expect(rejected((a) => (a.pronominal = true))).toContain(message);
    const verb = erAnswer('se laver', 'er-regular', { plain: 'lav', strong: 'lav', fut: 'laver' });
    expect(reasons(verb)).toEqual([]);
    verb.pronominal = false;
    expect(reasons(verb)).toEqual([message]);
    expect(
      reasons(erAnswer('s’habiller', 'er-regular', { plain: 'habill', strong: 'habill', fut: 'habiller' })),
    ).toEqual([]);
  });

  test('a failed parse reaches the caller as an InvalidAnswerError that names each reason', () => {
    const answer = erAnswer('aimer', 'er-regular', { plain: 'aim', strong: 'aim', fut: 'aimer' });
    delete answer.forms.present['1sg'];
    expect(() => parseAnswer('the conjugation', ConjugationAnswerSchema, answer)).toThrow(InvalidAnswerError);
    expect(() => parseAnswer('the conjugation', ConjugationAnswerSchema, answer)).toThrow(
      'forms.present.1sg: cell is missing',
    );
  });
});

describe('folding apostrophes before the parse', () => {
  test('ASCII and left quotes become U+2019 in every French string', () => {
    expect(foldApostrophes("j'aime l\u2018eau")).toBe('j’aime l’eau');
    const raw = {
      infinitive: "s'habiller",
      forms: { present: { '1sg': ["m'habille"] } },
      examples: { present: { fr: "J'aime ça.", gloss: "I don't mind." } },
    };
    expect(foldAnswerApostrophes(raw)).toEqual({
      infinitive: 's’habiller',
      forms: { present: { '1sg': ['m’habille'] } },
      examples: { present: { fr: 'J’aime ça.', gloss: "I don't mind." } },
    });
  });

  test('a folded answer parses, while the schema itself still rejects the straight apostrophe', () => {
    const answer = erAnswer(
      "s'habiller",
      'er-regular',
      { plain: 'habill', strong: 'habill', fut: 'habiller' },
      { pronominal: true, aux: 'etre' },
    );
    answer.examples.present.fr = "J'aime ça.";
    answer.examples.present.gloss = "I don't mind.";
    expect(reasons(answer)).not.toEqual([]);
    const parsed = ConjugationAnswerSchema.parse(foldAnswerApostrophes(answer));
    expect(parsed.infinitive).toBe('s’habiller');
    expect(parsed.examples.present).toEqual({ fr: 'J’aime ça.', gloss: "I don't mind." });
  });
});
