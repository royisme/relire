/** Published-index routing only: no topic content or live provider. */
import { expect, test } from 'bun:test';
import { grammarTagDestination } from '../src/utils/grammarTagDestination';

test('loading, failed and uncovered indexes have no destination', () => {
  expect(grammarTagDestination(undefined, 'articles')).toBeUndefined();
  expect(grammarTagDestination({}, 'articles')).toBeUndefined();
  expect(grammarTagDestination({ present: ['test-only'] }, 'articles')).toBeUndefined();
});

test('one published topic goes direct; several go to the tag-filtered list', () => {
  expect(grammarTagDestination({ articles: ['test-only'] }, 'articles')).toEqual({
    name: 'grammarTopic',
    topicId: 'test-only',
  });
  expect(grammarTagDestination({ present: ['test-only', 'another-test'] }, 'present')).toEqual({
    name: 'study',
    tab: 'grammar',
    tag: 'present',
  });
});
