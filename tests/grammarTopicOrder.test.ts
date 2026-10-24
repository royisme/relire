/** Pure book-order navigation probes use deliberately alphabetized TEST chapter input. */
import { expect, test } from 'bun:test';
import { nextTopicEntry, orderedChapters, topicAfter } from '../src/services/grammarTopics/order';
import { bookList } from './fixtures/grammarTopics';

test('chapters and their topics follow positions without mutating alphabetical input', () => {
  expect(
    orderedChapters(bookList).map(({ chapter, topics }) => [chapter, topics.map((entry) => entry.position)]),
  ).toEqual([
    ['chapter-one', [1, 2]],
    ['chapter-eight', [8]],
  ]);
  expect(bookList.map((entry) => entry.position)).toEqual([8, 2, 1]);
  expect(orderedChapters([])).toEqual([]);
});

test('Next skips studied topics and ignores marks outside the list', () => {
  expect(nextTopicEntry(bookList, new Set(['unknown']))?.id).toBe('test-one');
  expect(nextTopicEntry(bookList, new Set(['test-one']))?.id).toBe('test-two');
  expect(nextTopicEntry(bookList, new Set(bookList.map((entry) => entry.id)))).toBeUndefined();
  expect(nextTopicEntry([], new Set())).toBeUndefined();
});

test('topicAfter follows the next higher position, not input order or studied status', () => {
  expect(topicAfter(bookList, 'test-one')?.id).toBe('test-two');
  expect(topicAfter(bookList, 'test-two')?.id).toBe('test-eight');
  expect(topicAfter(bookList, 'test-eight')).toBeUndefined();
  expect(topicAfter(bookList, 'unknown')).toBeUndefined();
});
