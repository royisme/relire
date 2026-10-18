import { describe, expect, test } from 'bun:test';
import { InvalidAnswerError } from '../src/services/ai/errors';
import { conjugateRequest, promptFingerprint } from '../src/services/ai/prompts';
import { conjugateVerb } from '../src/services/ai/tasks';
import { conjugationKey } from '../src/storage/cache';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { parlerAnswer } from './fixtures/conjugationAnswer';

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the task to throw');
};

describe('conjugateVerb', () => {
  test('sends the schema and the template with the infinitive, and returns the validated answer', async () => {
    const provider = fakeProvider(parlerAnswer());
    const result = await conjugateVerb({ infinitive: 'se lever' }, contextOf(provider));
    expect(result).toEqual(parlerAnswer());
    const [request] = provider.requests;
    expect(request.prompt).toContain('the French verb "se lever"');
    expect(request.prompt).not.toContain('{{');
    expect(request.jsonSchema?.type).toBe('object');
    expect(Object.keys((request.jsonSchema?.properties ?? {}) as object).sort()).toEqual([
      'aux',
      'defective',
      'examples',
      'forms',
      'hAspire',
      'infinitive',
      'participles',
      'pronominal',
      'rule',
    ]);
    expect(JSON.stringify(request.jsonSchema)).not.toContain('"const"');
    expect(request.images).toBeUndefined();
  });

  test('the Chinese template is used for the Chinese UI language', async () => {
    const provider = fakeProvider(parlerAnswer());
    await conjugateVerb({ infinitive: 'se lever' }, contextOf(provider, 'vision', 'zh'));
    expect(provider.requests[0].prompt).toContain('动词“se lever”');
  });

  test('a malformed answer throws the schema’s reasons and nothing is substituted', async () => {
    const bad = parlerAnswer();
    delete bad.forms.present['3pl'];
    bad.examples.present.fr = "J'en parle.";
    const err = await rejection(conjugateVerb({ infinitive: 'parler' }, contextOf(fakeProvider(bad))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect((err as InvalidAnswerError).issues).toEqual([
      'examples.present.fr: use the typographic apostrophe U+2019',
      'forms.present.3pl: cell is missing',
    ]);
  });

  test('an answer that is not an object fails the same way', async () => {
    const err = await rejection(conjugateVerb({ infinitive: 'parler' }, contextOf(fakeProvider('oui'))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
  });

  test('a provider failure is passed through unchanged', async () => {
    const failure = new Error('quota exceeded');
    expect(await rejection(conjugateVerb({ infinitive: 'parler' }, contextOf(fakeProvider(failure))))).toBe(failure);
  });
});

describe('the request and the cache key', () => {
  test('the request is built from the template of the language', () => {
    expect(conjugateRequest({ infinitive: ' parler ' }, 'en').prompt).toContain('"parler"');
    expect(conjugateRequest({ infinitive: 'parler' }, 'zh').prompt).toContain('“parler”');
  });

  test('the fingerprint follows the template, so each language has its own', () => {
    expect(promptFingerprint('conjugate', 'en')).toMatch(/^[0-9a-z]+$/);
    expect(promptFingerprint('conjugate', 'en')).not.toBe(promptFingerprint('conjugate', 'zh'));
    expect(promptFingerprint('conjugate', 'en')).not.toBe(promptFingerprint('word', 'en'));
  });

  test('the key is language, fingerprint and the normalised infinitive', () => {
    expect(conjugationKey('en', 'fp', ' Parler ')).toBe('fp|en|parler');
    expect(conjugationKey('zh', 'fp', 'parler')).not.toBe(conjugationKey('en', 'fp', 'parler'));
    expect(conjugationKey('en', 'other', 'parler')).not.toBe(conjugationKey('en', 'fp', 'parler'));
  });
});
