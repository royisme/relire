/** The pure noun-gender round deck: order, misses returning, first-answer-only bookkeeping and counts. */
import { expect, test } from 'bun:test';
import {
  answerCard,
  createDeck,
  currentCard,
  summaryOf,
  wasAnswered,
  type GenderDeck,
} from '../src/services/nounGender/deck';

const ids = ['maison', 'livre', 'plage', 'âge'];

test('a new deck keeps the sampled order, starts on the first card and knows nothing has been answered', () => {
  const deck = createDeck(ids);
  expect(deck.queue).toEqual(ids);
  expect(deck.total).toBe(4);
  expect(currentCard(deck)).toBe('maison');
  expect(wasAnswered(deck, 'maison')).toBe(false);
  expect(summaryOf(deck)).toEqual({ total: 4, answered: 0, right: 0, firstTryRight: 0 });
});

test('a right answer takes the card out of the queue and the next card becomes current', () => {
  const deck = answerCard(createDeck(ids), 'maison', true);
  expect(deck.queue).toEqual(['livre', 'plage', 'âge']);
  expect(currentCard(deck)).toBe('livre');
  expect(wasAnswered(deck, 'maison')).toBe(true);
  expect(summaryOf(deck)).toEqual({ total: 4, answered: 1, right: 1, firstTryRight: 1 });
});

test('a miss goes to the end of the queue and the card returns later in the same round', () => {
  let deck: GenderDeck = createDeck(ids);
  deck = answerCard(deck, 'maison', false);
  expect(deck.queue).toEqual(['livre', 'plage', 'âge', 'maison']);
  deck = answerCard(deck, 'livre', true);
  deck = answerCard(deck, 'plage', true);
  deck = answerCard(deck, 'âge', true);
  expect(currentCard(deck)).toBe('maison');
  expect(summaryOf(deck)).toEqual({ total: 4, answered: 4, right: 3, firstTryRight: 3 });
  // The returning card answered right leaves the queue: the round is done.
  deck = answerCard(deck, 'maison', true);
  expect(deck.queue).toEqual([]);
  expect(currentCard(deck)).toBeUndefined();
  expect(summaryOf(deck)).toEqual({ total: 4, answered: 4, right: 4, firstTryRight: 3 });
});

test('a miss on a returning card sends it back again, and a later answer never rewrites the first one', () => {
  let deck = answerCard(createDeck(ids), 'maison', false);
  expect(deck.firstTry.maison).toBe(false);
  deck = answerCard(deck, 'livre', true);
  deck = answerCard(deck, 'plage', true);
  deck = answerCard(deck, 'âge', true);
  deck = answerCard(deck, 'maison', false);
  expect(deck.queue).toEqual(['maison']);
  expect(deck.firstTry.maison).toBe(false);
  deck = answerCard(deck, 'maison', true);
  expect(deck.firstTry.maison).toBe(false);
  expect(summaryOf(deck)).toEqual({ total: 4, answered: 4, right: 4, firstTryRight: 3 });
});

test('an abandoned round counts only the cards it answered', () => {
  const deck = answerCard(answerCard(createDeck(ids), 'maison', true), 'livre', false);
  expect(summaryOf(deck)).toEqual({ total: 4, answered: 2, right: 1, firstTryRight: 1 });
});
