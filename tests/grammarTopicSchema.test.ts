/** Owns structural topic schema tests with synthetic probes, not linguistic validation. */
import { expect, test } from 'bun:test';
import { GrammarTopicSchema, GrammarTopicsPackSchema, GrammarTagIndexSchema } from '../src/types/grammarTopic';
import { topicFixture, topicsFixture } from './fixtures/grammarTopics';

test('the fixture covers all block types; zero topics and levels beyond A1 are valid', () => {
  expect(GrammarTopicsPackSchema.safeParse(topicsFixture()).success).toBe(true);
  expect(GrammarTopicsPackSchema.safeParse({ ...topicsFixture(), topics: [] }).success).toBe(true);
  expect(GrammarTopicSchema.safeParse({ ...topicFixture(), level: 'C1' }).success).toBe(true);
});

test('Grammar section names cannot be topic ids', () => {
  for (const id of ['conjugation', 'gender']) {
    expect(GrammarTopicSchema.safeParse({ ...topicFixture(), id }).success).toBe(false);
  }
});

test('drafts are valid authoring rows, but never valid published topics', () => {
  const pack = topicsFixture();
  pack.topics[0].status = 'draft';
  delete pack.topics[0].reviewedBy;
  delete pack.topics[0].reviewedAt;
  expect(GrammarTopicSchema.safeParse(pack.topics[0]).success).toBe(true);
  expect(GrammarTopicsPackSchema.safeParse(pack).success).toBe(false);
});

for (const key of ['reviewedBy', 'reviewedAt'] as const) {
  test(`reviewed requires ${key}`, () => {
    const topic = topicFixture();
    delete topic[key];
    expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  });
}

test('duplicate ids and dangling or self related ids are rejected', () => {
  const pack = topicsFixture();
  pack.topics.push(topicFixture());
  expect(GrammarTopicsPackSchema.safeParse(pack).success).toBe(false);
  for (const id of ['missing', 'test-only']) {
    const probe = topicsFixture();
    probe.topics[0].related = [id];
    expect(GrammarTopicsPackSchema.safeParse(probe).success).toBe(false);
  }
  pack.topics[1].id = 'another-test';
  pack.topics[0].related = ['another-test'];
  expect(GrammarTopicsPackSchema.safeParse(pack).success).toBe(true);
});

test('tables reject ragged rows and unpaired glosses; French-only and bilingual label cells pass', () => {
  const topic = topicFixture();
  const table = topic.blocks[2];
  if (table.type !== 'table') throw new Error('fixture must contain a table');
  table.rows[0].pop();
  expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  table.rows[0].push({ fr: 'TEST' });
  for (const bad of [{}, { en: 'TEST' }, { fr: 'TEST', en: 'TEST' }, { zh: '\u6d4b' }]) {
    table.rows[0][0] = bad;
    expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  }
});

test('speakers are set for all examples or none', () => {
  const topic = topicFixture();
  const examples = topic.blocks[3];
  if (examples.type !== 'examples') throw new Error('fixture must contain examples');
  examples.items[0].speaker = 'A';
  expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  examples.items[1].speaker = 'B';
  expect(GrammarTopicSchema.safeParse(topic).success).toBe(true);
});

test('language checks reject CJK in French or English and missing CJK in Chinese', () => {
  for (const language of ['fr', 'en', 'zh'] as const) {
    const topic = topicFixture();
    const examples = topic.blocks[3];
    if (examples.type !== 'examples') throw new Error('fixture must contain examples');
    examples.items[0][language] = language === 'zh' ? 'TEST' : '\u6d4b';
    expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  }
});

test('all strings must be NFC, and French uses typographic apostrophes', () => {
  const topic = topicFixture();
  topic.provenance.model = 'e\u0301';
  expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  topic.provenance.model = 'TEST';
  const examples = topic.blocks[3];
  if (examples.type !== 'examples') throw new Error('fixture must contain examples');
  examples.items[0].fr = "TEST'TEST";
  expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  examples.items[0].fr = 'TEST\u2019TEST';
  expect(GrammarTopicSchema.safeParse(topic).success).toBe(true);
});

test('tags are known, unique, nonempty and limited to two', () => {
  for (const tags of [[], ['unknown'], ['articles', 'articles'], ['articles', 'present', 'future']]) {
    expect(GrammarTopicSchema.safeParse({ ...topicFixture(), tags }).success).toBe(false);
  }
});

test('tag index is partial, with known tags and nonempty slug lists', () => {
  expect(GrammarTagIndexSchema.safeParse({}).success).toBe(true);
  expect(GrammarTagIndexSchema.safeParse({ articles: ['test-only'] }).success).toBe(true);
  expect(GrammarTagIndexSchema.safeParse({ unknown: ['test-only'] }).success).toBe(false);
  expect(GrammarTagIndexSchema.safeParse({ articles: [] }).success).toBe(false);
});
