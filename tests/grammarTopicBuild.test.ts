/** Owns topic assembly and hash-gate tests; fixtures are not owner reviews or teaching content. */
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildTopics, readTopicInputs, type TopicBuildInputs } from '../scripts/grammar-pack/topics';
import { topicContentHash } from '../scripts/grammar-pack/gate';
import { topicFixture } from './fixtures/grammarTopics';
import { learningFixture, testBilingual } from './fixtures/grammarLearning';
import { topicExerciseRevision } from '../src/services/grammarTopics/checkpoints';
import { checkTopicMetadata } from '../scripts/grammar-topics/publish';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const inputs = (): TopicBuildInputs => {
  const topic = topicFixture();
  return {
    manifest: {
      packVersion: '0.1.0',
      topics: [
        {
          id: topic.id,
          reference: topic.provenance.reference,
          level: topic.level,
          chapter: topic.chapter,
          tags: topic.tags,
          related: topic.related,
          include: true,
        },
      ],
    },
    drafts: [topic],
    reviews: {
      records: [
        { topicId: topic.id, contentHash: topicContentHash(topic), reviewedBy: 'TEST ONLY', reviewedAt: '2026-10-18' },
      ],
    },
  };
};

test('an included draft fails by name, even if it claims reviewed status', () => {
  const input = inputs();
  input.reviews.records = [];
  expect(() => buildTopics(input)).toThrow('test-only: publish gate refuses draft');
  input.drafts[0].status = 'draft';
  expect(() => buildTopics(input)).toThrow('test-only: publish gate refuses draft');
});

test('a content edit lapses review; a new matching review supersedes the old one', () => {
  const input = inputs();
  input.drafts[0].title.en = 'EDITED TEST';
  expect(() => buildTopics(input)).toThrow('test-only: review lapsed');
  input.reviews.records.push({ ...input.reviews.records[0], contentHash: topicContentHash(input.drafts[0]) });
  expect(buildTopics(input).pack.topics[0].title.en).toBe('EDITED TEST');
  input.reviews.records.push({ ...input.reviews.records[0] });
  expect(() => buildTopics(input)).toThrow('test-only: review lapsed');
});

test('manifest metadata edits lapse review too, and excluded topics need no draft or review', () => {
  const input = inputs();
  input.manifest.topics[0].tags = ['present'];
  expect(() => buildTopics(input)).toThrow('test-only: review lapsed');
  input.manifest.topics[0].include = false;
  input.drafts = [];
  input.reviews.records = [];
  const result = buildTopics(input);
  expect(result.pack.topics).toEqual([]);
  expect(result.tagIndex).toEqual({});
  expect(result.report).toEqual(['test-only: excluded; skipped']);
});

test('canonical topic hash covers exactly title, blocks, learning, tags, related, level and chapter', () => {
  const topic = topicFixture();
  const hash = topicContentHash(topic);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  for (const edit of [
    { title: { ...topic.title, en: 'EDIT' } },
    { blocks: [topic.blocks[0]] },
    { tags: ['present'] as const },
    { related: ['other-test'] },
    { level: 'B2' as const },
    { chapter: 'other-test' },
  ]) {
    expect(topicContentHash({ ...topic, ...edit, tags: [...(edit.tags ?? topic.tags)] })).not.toBe(hash);
  }
  expect(
    topicContentHash({
      ...topic,
      id: 'other-test',
      status: 'draft',
      reviewedBy: undefined,
      reviewedAt: undefined,
      provenance: { ...topic.provenance, model: 'OTHER TEST' },
    }),
  ).toBe(hash);
  expect(topicContentHash(Object.fromEntries(Object.entries(topic).reverse()) as typeof topic)).toBe(hash);
});

test('every learning edit lapses publication review and changes exercise revision independently', async () => {
  const original = learningFixture();
  const publication = topicContentHash(original);
  const exercise = await topicExerciseRevision(original);
  const edits: [string, (topic: ReturnType<typeof learningFixture>) => void][] = [
    [
      'question',
      (t) => {
        t.learning.checkpoints[0].questions[1].prompt += ' TEST edit';
      },
    ],
    [
      'answer',
      (t) => {
        t.learning.checkpoints[0].questions[1].expectedAnswer = 'lycée';
      },
    ],
    [
      'accepted answer',
      (t) => {
        t.learning.checkpoints[0].questions[1].acceptableAnswers = ['lycée'];
      },
    ],
    [
      'correct summary',
      (t) => {
        t.learning.checkpoints[0].questions[0].feedback.correct.summary.en += ' TEST edit';
      },
    ],
    [
      'incorrect detail',
      (t) => {
        t.learning.checkpoints[0].questions[0].feedback.incorrect.detail!.zh += ' TEST edit';
      },
    ],
    [
      'wrong match',
      (t) => {
        t.learning.checkpoints[0].questions[0].feedback.byAnswer![0].message.summary.en += ' TEST edit';
      },
    ],
    [
      'teaching',
      (t) => {
        t.learning.checkpoints[0].teaching[0] = { type: 'note', text: testBilingual('TEST edit') };
      },
    ],
    [
      'instruction',
      (t) => {
        t.learning.instruction.en += ' TEST edit';
      },
    ],
    [
      'checkpoint title',
      (t) => {
        t.learning.checkpoints[0].title.en += ' TEST edit';
      },
    ],
    [
      'order',
      (t) => {
        t.learning.checkpoints.reverse();
      },
    ],
  ];
  for (const [name, edit] of edits) {
    const topic = learningFixture();
    edit(topic);
    expect(topicContentHash(topic), name).not.toBe(publication);
    expect(await topicExerciseRevision(topic), name).not.toBe(exercise);
    const input = inputs();
    input.drafts = [topic];
    input.reviews.records[0].contentHash = publication;
    expect(() => buildTopics(input), name).toThrow('review lapsed');
    input.reviews.records[0].contentHash = topicContentHash(topic);
    expect(buildTopics(input).pack.topics[0].learning, name).toEqual(topic.learning);
  }
  const referenceEdit = learningFixture();
  referenceEdit.blocks.push({ type: 'note', text: testBilingual('TEST full reference edit') });
  expect(topicContentHash(referenceEdit)).not.toBe(publication);
  expect(await topicExerciseRevision(referenceEdit)).toBe(exercise);
  const input = inputs();
  input.drafts = [referenceEdit];
  input.reviews.records[0].contentHash = publication;
  expect(() => buildTopics(input)).toThrow('review lapsed');
});

test('missing or duplicate drafts and duplicate manifest ids fail rather than fabricate content', () => {
  const input = inputs();
  input.drafts = [];
  expect(() => buildTopics(input)).toThrow('test-only: expected one draft, found 0');
  input.drafts = [topicFixture(), topicFixture()];
  expect(() => buildTopics(input)).toThrow('test-only: expected one draft, found 2');
  input.manifest.topics.push(input.manifest.topics[0]);
  expect(() => buildTopics(input)).toThrow('duplicate id test-only');
});

test('uncertain is draft-only and status/reviewer are derived from the matching review', () => {
  const input = inputs();
  Object.assign(input.drafts[0], { uncertain: ['TEST ONLY'] });
  const topic = buildTopics(input).pack.topics[0];
  expect(topic).not.toHaveProperty('uncertain');
  expect(topic.status).toBe('reviewed');
  expect(topic.reviewedBy).toBe('TEST ONLY');
});

test('tag index exactly follows the published topics, including secondary tags', () => {
  const input = inputs();
  input.drafts[0].tags = ['articles', 'prepositions'];
  input.manifest.topics[0].tags = input.drafts[0].tags;
  input.reviews.records[0].contentHash = topicContentHash(input.drafts[0]);
  const { pack, tagIndex } = buildTopics(input);
  const expected: Record<string, string[]> = {};
  for (const topic of pack.topics) for (const tag of topic.tags) (expected[tag] ??= []).push(topic.id);
  expect(tagIndex).toEqual(expected);
});

test('an empty manifest publishes an empty pack and index', () => {
  const { pack, tagIndex } = buildTopics({
    manifest: { packVersion: '0.1.0', topics: [] },
    drafts: [],
    reviews: { records: [] },
  });
  expect(pack.topics).toEqual([]);
  expect(tagIndex).toEqual({});
});

test('committed public metadata is valid and both locales cover manifest chapters without drafts', async () => {
  const root = new URL('../data/grammar-topics/', import.meta.url);
  checkTopicMetadata(
    await Bun.file(new URL('manifest.json', root)).json(),
    await Bun.file(new URL('reviews.json', root)).json(),
  );
});

test('the dynamic chapter-key gate fails when either locale lacks a synthetic manifest chapter', () => {
  const { manifest, reviews } = inputs();
  const labelled = { grammarTopics: { chapters: { 'test-only': 'TEST ONLY' } } };
  checkTopicMetadata(manifest, reviews, { en: labelled, zh: labelled });
  for (const locales of [
    { en, zh: labelled },
    { en: labelled, zh },
  ])
    expect(() => checkTopicMetadata(manifest, reviews, locales)).toThrow('grammarTopics.chapters.test-only');
});

test('the topics builder reads included drafts from the private directory only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-private-build-'));
  try {
    const input = inputs();
    await Bun.write(join(directory, 'data/grammar-topics/manifest.json'), JSON.stringify(input.manifest));
    await Bun.write(join(directory, 'data/grammar-topics/reviews.json'), JSON.stringify(input.reviews));
    await Bun.write(join(directory, '.local/grammar-topics/drafts-test-only.json'), JSON.stringify(input.drafts));
    const read = await readTopicInputs(pathToFileURL(directory + '/'));
    expect(buildTopics(read).pack.topics).toHaveLength(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
