import { describe, expect, test } from 'bun:test';
import bundledThemes from '../src/data/themes/themes.json';
import { InvalidAnswerError } from '../src/services/ai/errors';
import { generateAtelierRound, gradeAtelierBuild } from '../src/services/ai/tasks';
import { joinBricks } from '../src/services/atelier/join';
import { parseRound } from '../src/services/atelier/parse';
import { ThemesSchema } from '../src/types/themes';
import { rejection } from './fixtures/aiTaskAssertions';
import { beach, cinema, coffee } from './fixtures/atelier';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';

const theme = ThemesSchema.parse(bundledThemes).find((entry) => entry.id === 'work')!;
const input = { theme, level: 'B1' as const, count: 3 };
const badJoin = { ...beach, sentence: 'Nous allons à la piscine.' };
const badLink = { ...coffee, links: [{ ...coffee.links[0], head: 8 }] };
const joinReason = 'the bricks join to “Nous allons à la plage.” but the sentence reads “Nous allons à la piscine.”';
const linkReason = 'the link “sujet” names head index 8, out of range';

describe('generateAtelierRound', () => {
  for (const lang of ['en', 'zh'] as const)
    test(`returns a good round and passes ${lang} through with the theme and topics`, async () => {
      const items = structuredClone([coffee, cinema, beach]);
      const provider = fakeProvider({ items });
      expect(await generateAtelierRound(input, contextOf(provider, 'vision', lang))).toEqual({ items, dropped: [] });
      expect(provider.requests).toHaveLength(1);
      const request = provider.requests[0];
      expect(request.prompt).toContain(theme.fr);
      expect(request.prompt).toContain(theme.subtopics.map((subtopic) => subtopic.fr).join(', '));
      expect(request.prompt).toContain(lang === 'en' ? 'exactly 3 items' : '恰好 3 道题');
      expect(request.jsonSchema).toMatchObject({ type: 'object', properties: { items: { type: 'array' } } });
    });

  test('keeps good items in order and reports the bad original index and reason', async () => {
    const provider = fakeProvider({ items: [coffee, badJoin, cinema] });
    expect(await generateAtelierRound(input, contextOf(provider))).toEqual({
      items: [coffee, cinema],
      dropped: [{ index: 1, reason: joinReason }],
    });
  });

  test('when every item is bad, InvalidAnswerError includes every drop reason', async () => {
    const provider = fakeProvider({ items: [badJoin, badLink] });
    const err = await rejection(generateAtelierRound(input, contextOf(provider)));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toStartWith('The AI answer for the round was not usable:');
    expect(err.message).toContain(`item 0 was dropped: ${joinReason}`);
    expect(err.message).toContain(`item 1 was dropped: ${linkReason}`);
  });

  test('an empty model round is not returned as a substitute playable round', async () => {
    const err = await rejection(generateAtelierRound(input, contextOf(fakeProvider({ items: [] }))));
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toStartWith('The AI answer for the round was not usable:');
  });

  test.each([null, {}, { items: 'x' }])('a non-round answer %j reports the round error', async (raw) => {
    const err = await rejection(generateAtelierRound(input, contextOf(fakeProvider(raw))));
    expect(err.message).toStartWith('The round was not usable:');
  });

  test.each([0, 11, 2.5])('count %s is rejected before any request', async (count) => {
    const provider = fakeProvider({ items: [beach] });
    const err = await rejection(generateAtelierRound({ ...input, count }, contextOf(provider)));
    expect(err).toBeInstanceOf(RangeError);
    expect(provider.requests).toHaveLength(0);
  });

  test('a provider error propagates unchanged, without a substitute round or retry', async () => {
    const failure = new Error('provider quota exceeded');
    const provider = fakeProvider(failure);
    expect(await rejection(generateAtelierRound(input, contextOf(provider)))).toBe(failure);
    expect(provider.requests).toHaveLength(1);
  });
});

describe('gradeAtelierBuild', () => {
  for (const lang of ['en', 'zh'] as const)
    test(`returns a parsed grade and sends the joined reference, item and learner answer (${lang})`, async () => {
      // A boundary-valid sentence can have straight apostrophes/outer whitespace; the reference must use the bricks.
      const item = { ...structuredClone(coffee), sentence: "  J'aime le café.  " };
      const userAnswer = 'J’aime du café.';
      const grade = {
        isCorrect: false,
        feedback: 'Use the definite article for a general preference.',
        correctedVersion: 'J’aime le café.',
      };
      const provider = fakeProvider({ ...grade, score: 12 });
      expect(parseRound({ items: [item] }).dropped).toEqual([]);
      expect(joinBricks(item.bricks)).toBe('J’aime le café.');
      expect(await gradeAtelierBuild({ item, userAnswer }, contextOf(provider, 'vision', lang))).toEqual(grade);
      expect(provider.requests).toHaveLength(1);
      const { prompt, jsonSchema } = provider.requests[0];
      expect(prompt).toContain(JSON.stringify(item));
      expect(prompt).toContain(userAnswer);
      expect(prompt).toContain(lang === 'en' ? 'Expected sentence: "J’aime le café."' : '参考句子：“J’aime le café.”');
      expect(prompt).not.toContain(
        lang === 'en' ? `Expected sentence: "${item.sentence}"` : `参考句子：“${item.sentence}”`,
      );
      expect(jsonSchema).toMatchObject({
        required: ['isCorrect', 'feedback'],
        properties: { isCorrect: { type: 'boolean' }, feedback: { type: 'string' } },
      });
    });

  test('a malformed grade throws the usual invalid-answer error with its real reason', async () => {
    const err = await rejection(
      gradeAtelierBuild(
        { item: coffee, userAnswer: 'J’aime du café.' },
        contextOf(fakeProvider({ isCorrect: 'yes', feedback: 'Fine.' })),
      ),
    );
    expect(err).toBeInstanceOf(InvalidAnswerError);
    expect(err.message).toStartWith('The AI answer for the grade was not usable:');
    expect(err.message).toContain('isCorrect');
  });
});

test('parseRound(null) names null rather than calling it an object', () => {
  expect(() => parseRound(null)).toThrow('The round was not usable: null instead of an object');
  expect(() => parseRound(null)).not.toThrow('type object');
});
