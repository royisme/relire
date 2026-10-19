/** Owns hint, explanation, grading and exercise-generation cases, not material import or provider image support. */
import { describe, expect, test } from 'bun:test';
import { InvalidAnswerError } from '../src/services/ai/errors';
import {
  explainMistake,
  generateAdaptiveDrills,
  generateExercises,
  gradeOpenAnswer,
  hint,
} from '../src/services/ai/tasks';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { ITEMS, unitOf } from './fixtures/units';
import { expectSchemaSent, rejection } from './fixtures/aiTaskAssertions';

const item = { id: 'h1', prompt: 'Je [___] française.', userAnswer: 'es', grammarTag: 'present' };

describe('hint', () => {
  const good = { hint: 'Look at the **subject**.', grammarRule: 'je + suis', clueWord: 's' };

  test('returns the validated hint and sends the hint schema', async () => {
    const provider = fakeProvider(good);
    const result = await hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(provider));
    expect(result).toEqual(good);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain('Je [___] française.');
    expect(provider.requests[0].images).toBeUndefined();
  });

  test('clueWord is optional', async () => {
    const { clueWord: _clue, ...without } = good;
    const result = await hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(fakeProvider(without)));
    expect(result.clueWord).toBeUndefined();
  });

  test('a malformed answer throws with the real reason and no fallback', async () => {
    const provider = fakeProvider({ hint: 'Look.', clueWord: 's' });
    const err = await rejection(hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(provider)));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('grammarRule');
    expect((err as InvalidAnswerError).issues.length).toBeGreaterThan(0);
  });

  test('a provider failure is passed through unchanged', async () => {
    const failure = new Error('quota exceeded');
    const err = await rejection(hint({ ...item, exerciseType: 'FILL_BLANKS' }, contextOf(fakeProvider(failure))));
    expect(err).toBe(failure);
  });
});

describe('explainMistake', () => {
  const good = { summary: 'Être in the present.', details: 'Je **suis**.', tip: 'je suis, tu es' };
  const input = { ...item, expectedAnswer: 'suis' };

  test('validates and sends the explanation schema', async () => {
    const provider = fakeProvider(good);
    expect(await explainMistake(input, contextOf(provider))).toEqual(good);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain('suis');
  });

  test('rejects an empty field', async () => {
    const err = await rejection(explainMistake(input, contextOf(fakeProvider({ ...good, tip: '  ' }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('tip');
  });
});

describe('gradeOpenAnswer', () => {
  const input = {
    prompt: "Comment demande-t-on l'âge ?",
    expectedAnswer: 'Vous avez quel âge ?',
    userAnswer: 'Quel âge as-tu ?',
  };

  test('returns a verdict and feedback, with no invented score', async () => {
    const provider = fakeProvider({ isCorrect: true, feedback: 'Fine, informal.', score: 97 });
    const result = await gradeOpenAnswer(input, contextOf(provider));
    expect(result).toEqual({ isCorrect: true, feedback: 'Fine, informal.' });
    expectSchemaSent(provider.requests[0]);
    expect(JSON.stringify(provider.requests[0].jsonSchema)).not.toContain('score');
  });

  test('rejects a verdict that is not a boolean', async () => {
    const err = await rejection(gradeOpenAnswer(input, contextOf(fakeProvider({ isCorrect: 'yes', feedback: 'ok' }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('isCorrect');
  });
});

describe('generateAdaptiveDrills', () => {
  const dictation = { ...ITEMS.NUMBER_DICTATION, id: 'd2', type: 'NUMBER_DICTATION' };
  const drills = {
    drillTitle: 'Passé composé',
    focusSummary: 'Auxiliaries and agreement.',
    items: [{ ...ITEMS.WORD_TRANSFORM, type: 'WORD_TRANSFORM' }, dictation],
  };
  const input = { targets: ['passe-compose' as const], count: 2, level: 'A2' };

  test('validates the set and sends the drills schema', async () => {
    const provider = fakeProvider(drills);
    const result = await generateAdaptiveDrills(input, contextOf(provider));
    expect(result.items).toHaveLength(2);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain('passe-compose');
  });

  test('recent mistakes reach the prompt as data', async () => {
    const provider = fakeProvider(drills);
    const recentMistakes = [{ prompt: 'Elle [___] partie.', userAnswer: 'a', expectedAnswer: 'est' }];
    await generateAdaptiveDrills({ ...input, recentMistakes }, contextOf(provider));
    expect(provider.requests[0].prompt).toContain(JSON.stringify(recentMistakes));
  });

  test('a dictation without the text to read aloud is rejected', async () => {
    const { audioText: _audio, ...silent } = dictation;
    const err = await rejection(generateAdaptiveDrills(input, contextOf(fakeProvider({ ...drills, items: [silent] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('audioText');
  });

  test('an item whose answer does not fit its type is rejected', async () => {
    const wrong = { ...ITEMS.GENDER_CHECK, type: 'GENDER_CHECK', expectedAnswer: 'neutre' };
    const err = await rejection(generateAdaptiveDrills(input, contextOf(fakeProvider({ ...drills, items: [wrong] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
  });

  test('refuses impossible requests before sending anything', async () => {
    const provider = fakeProvider(drills);
    await rejection(generateAdaptiveDrills({ ...input, targets: [] }, contextOf(provider)));
    await rejection(generateAdaptiveDrills({ ...input, count: 0 }, contextOf(provider)));
    await rejection(generateAdaptiveDrills({ ...input, count: 50 }, contextOf(provider)));
    await rejection(generateAdaptiveDrills({ ...input, level: ' ' }, contextOf(provider)));
    expect(provider.requests).toHaveLength(0);
  });
});

describe('generateExercises', () => {
  const article = 'Le matin, Léa prend le train pour Lyon. Elle a rendez-vous avec une amie.';
  const input = { articleText: article, count: 2, level: 'A2' };
  const {
    setId: _setId,
    level: _level,
    ...unit
  } = unitOf('FILL_BLANKS', [
    {
      ...ITEMS.FILL_BLANKS,
      prompt: 'Léa [___] le train.',
      expectedAnswer: 'prend',
      articleQuote: 'Léa prend le train',
    } as never,
  ]);
  const answer = (articleQuote: string | undefined) => ({
    units: [{ ...unit, items: [{ ...unit.items[0], articleQuote }] }],
  });
  /** One unit of three items numbered 1-3, with the given quotes. */
  const threeItems = (quotes: (string | undefined)[]) => ({
    units: [
      {
        ...unit,
        items: quotes.map((articleQuote, index) => ({
          ...unit.items[0],
          id: `i${index + 1}`,
          itemNumber: index + 1,
          articleQuote,
        })),
      },
    ],
  });

  test('keeps a quote that is in the article and sends the exercise schema', async () => {
    const provider = fakeProvider(answer('Le matin, Léa  PREND le train'));
    const result = await generateExercises(input, contextOf(provider));
    expect(result.units[0].items[0].articleQuote).toBe('Le matin, Léa  PREND le train');
    expect(result.dropped).toBe(0);
    expectSchemaSent(provider.requests[0]);
    expect(provider.requests[0].prompt).toContain(article);
  });

  test('a quote may join stretches with an ellipsis', async () => {
    const result = await generateExercises(input, contextOf(fakeProvider(answer('Léa prend … une amie.'))));
    expect(result.units).toHaveLength(1);
  });

  test('an item without a quote cannot be checked and is kept', async () => {
    const result = await generateExercises(input, contextOf(fakeProvider(answer(undefined))));
    expect(result.units[0].items[0].articleQuote).toBeUndefined();
    expect(result.dropped).toBe(0);
  });

  test('items whose quote is not in the article are left out and counted; the rest is kept and renumbered', async () => {
    const result = await generateExercises(
      input,
      contextOf(fakeProvider(threeItems(['Léa prend le train', 'Léa prend le bus', undefined]))),
    );
    expect(result.dropped).toBe(1);
    expect(result.units).toHaveLength(1);
    expect(result.units[0].items.map((item) => item.id)).toEqual(['i1', 'i3']);
    expect(result.units[0].items.map((item) => item.itemNumber)).toEqual([1, 2]);
  });

  test('a unit left with no items is dropped and the other units stay', async () => {
    const second = { ...unit, id: 'u2', items: [{ ...unit.items[0], articleQuote: 'Léa prend le bus' }] };
    const first = { ...unit, items: [{ ...unit.items[0], articleQuote: 'Elle a rendez-vous' }] };
    const result = await generateExercises(input, contextOf(fakeProvider({ units: [first, second] })));
    expect(result.units.map((u) => u.id)).toEqual([unit.id]);
    expect(result.dropped).toBe(1);
  });

  test('when nothing is left it fails and names the quotes', async () => {
    const err = await rejection(generateExercises(input, contextOf(fakeProvider(answer('Léa prend le bus')))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain(unit.items[0].id);
    expect(err.message).toContain('Léa prend le bus');
  });

  test('a schema failure throws with the schema reason', async () => {
    const err = await rejection(generateExercises(input, contextOf(fakeProvider({ units: [] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
  });

  test('an item that breaks its type shape is rejected', async () => {
    const broken = { units: [{ ...unit, items: [{ ...unit.items[0], expectedAnswer: ['a', 'b'] }] }] };
    const err = await rejection(generateExercises(input, contextOf(fakeProvider(broken))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('expectedAnswer');
  });

  test('a generated cloze without its passage fails instead of inventing one', async () => {
    const cloze = { ...unit, type: 'READING_CLOZE' };
    const err = await rejection(generateExercises(input, contextOf(fakeProvider({ units: [cloze] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toContain('readingPassage');
    const readingPassage = { content: article };
    const result = await generateExercises(input, contextOf(fakeProvider({ units: [{ ...cloze, readingPassage }] })));
    expect(result.units[0].readingPassage).toEqual(readingPassage);
  });

  test('refuses an empty article or a bad count before sending', async () => {
    const provider = fakeProvider(answer('Léa prend le train'));
    await rejection(generateExercises({ ...input, articleText: '  ' }, contextOf(provider)));
    await rejection(generateExercises({ ...input, count: 2.5 }, contextOf(provider)));
    expect(provider.requests).toHaveLength(0);
  });
});
