import { expect, test } from 'bun:test';
import { keepAnswerable, quoteInArticle, unsupportedQuotes } from '../src/services/exercises/answerability';
import { exercisesKey, explanationKey, hintKey } from '../src/storage/cache';

const article = 'Le renard dit : « On ne voit bien qu’avec le cœur. »  L’essentiel est invisible pour les yeux.';

test('a quote matches regardless of case, spacing, apostrophes and quotation marks', () => {
  expect(quoteInArticle("on ne voit bien qu'avec le cœur", article)).toBe(true);
  expect(quoteInArticle('Le renard dit : « On ne voit', article)).toBe(true);
  expect(quoteInArticle('L’essentiel   est invisible', article)).toBe(true);
});

test('words that are not in the article do not match', () => {
  expect(quoteInArticle('Le renard dit bonjour', article)).toBe(false);
  expect(quoteInArticle('', article)).toBe(false);
  expect(quoteInArticle('…', article)).toBe(false);
});

test('each stretch around an ellipsis is checked on its own', () => {
  expect(quoteInArticle('On ne voit bien … pour les yeux', article)).toBe(true);
  expect(quoteInArticle('On ne voit bien ... pour les oreilles', article)).toBe(false);
});

test('only items that carry a missing quote are reported', () => {
  const units = [
    {
      id: 'u1',
      items: [{ id: 'a', articleQuote: 'le cœur' }, { id: 'b', articleQuote: 'le chapeau' }, { id: 'c' }],
    },
  ];
  expect(unsupportedQuotes(units, article)).toEqual([{ unitId: 'u1', itemId: 'b', quote: 'le chapeau' }]);
});

test('only the items with a missing quote are left out; plain numbers close up and letters stay', () => {
  const item = (id: string, itemNumber: number | string, articleQuote?: string) => ({ id, itemNumber, articleQuote });
  const units = [
    { id: 'u1', items: [item('a', 1, 'le cœur'), item('b', 2, 'le chapeau'), item('c', 3)] },
    { id: 'u2', items: [item('d', 'a', 'le chapeau'), item('e', 'b', 'pour les yeux')] },
    { id: 'u3', items: [item('f', 1, 'le chapeau')] },
  ];
  const kept = keepAnswerable(units, article);
  expect(kept.dropped).toBe(3);
  expect(kept.units.map((unit) => unit.id)).toEqual(['u1', 'u2']);
  expect(kept.units[0].items.map((i) => [i.id, i.itemNumber])).toEqual([
    ['a', 1],
    ['c', 2],
  ]);
  expect(kept.units[1].items.map((i) => [i.id, i.itemNumber])).toEqual([['e', 'b']]);
  expect(kept.missing.map((m) => m.itemId)).toEqual(['b', 'd', 'f']);
  // The input is not changed.
  expect(units[0].items).toHaveLength(3);
});

const base = { prompt: 'Je [___] {suis|es}', userAnswer: 'Es', grammarTag: 'present', exerciseType: 'FILL_BLANKS' };

test('hint and explanation keys follow language, prompt version and the normalized item', () => {
  const key = hintKey('en', 'fp1', base);
  expect(hintKey('en', 'fp1', { ...base, userAnswer: '  es ' })).toBe(key);
  expect(hintKey('en', 'fp2', base)).not.toBe(key);
  expect(hintKey('zh', 'fp1', base)).not.toBe(key);
  expect(hintKey('en', 'fp1', { ...base, userAnswer: 'suis' })).not.toBe(key);
  expect(hintKey('en', 'fp1', { ...base, context: 'Un dialogue.' })).not.toBe(key);
  // A "|" inside a prompt cannot make two different items collide.
  expect(hintKey('en', 'fp1', { ...base, prompt: 'a', userAnswer: 'b|c' })).not.toBe(
    hintKey('en', 'fp1', { ...base, prompt: 'a|b', userAnswer: 'c' }),
  );
  expect(explanationKey('en', 'fp1', { ...base, expectedAnswer: 'suis' })).not.toBe(
    explanationKey('en', 'fp1', { ...base, expectedAnswer: 'es' }),
  );
});

test('exercise keys follow article text, count and level, never the provider', () => {
  const key = exercisesKey('en', 'fp', 'B1', 6, article, 'reading');
  expect(exercisesKey('en', 'fp', ' b1 ', 6, article, 'reading')).toBe(key);
  expect(exercisesKey('en', 'fp', 'B1', 8, article, 'reading')).not.toBe(key);
  expect(exercisesKey('en', 'fp', 'A2', 6, article, 'reading')).not.toBe(key);
  expect(exercisesKey('en', 'fp', 'B1', 6, article + ' ', 'reading')).not.toBe(key);
  expect(exercisesKey('en', 'other', 'B1', 6, article, 'reading')).not.toBe(key);
});
