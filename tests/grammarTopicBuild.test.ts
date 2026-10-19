/** Owns topic gate, hash and deterministic artifact tests; fixtures are not owner reviews or teaching content. */
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildTopics,
  readTopicInputs,
  type TopicBuildInputs,
  type TopicManifest,
} from '../scripts/grammar-pack/topics';
import { topicContentHash, writeArtifact } from '../scripts/grammar-pack/gate';
import { topicFixture } from './fixtures/grammarTopics';
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

test('canonical topic hash covers exactly title, blocks, tags, related, level and chapter', () => {
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

function requireChapterLabels(manifest: TopicManifest, locales: unknown[]) {
  for (const { chapter } of manifest.topics) {
    for (const locale of locales) expect(locale).toHaveProperty(`grammarTopics.chapters.${chapter}`);
  }
}

test('committed artifacts match derived bytes and both locales cover manifest chapters', async () => {
  const input = await readTopicInputs();
  requireChapterLabels(input.manifest, [en, zh]);
  const { pack, tagIndex } = buildTopics(input);
  const root = new URL('../src/data/grammar/', import.meta.url);
  await writeArtifact(new URL('topics.json', root), pack, true);
  await writeArtifact(new URL('tag-index.json', root), tagIndex, true);
});

test('the dynamic chapter-key gate fails when either locale lacks a synthetic manifest chapter', () => {
  const { manifest } = inputs();
  const labelled = { grammarTopics: { chapters: { 'test-only': 'TEST ONLY' } } };
  requireChapterLabels(manifest, [labelled, labelled]);
  for (const locales of [
    [labelled, en],
    [zh, labelled],
  ]) {
    expect(() => requireChapterLabels(manifest, locales)).toThrow('grammarTopics.chapters.test-only');
  }
});

test('--check is byte-exact and does not rewrite a drifted artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-topic-check-'));
  try {
    const output = pathToFileURL(join(directory, 'topics.json'));
    const { pack } = buildTopics(inputs());
    await writeArtifact(output, pack, false);
    const bytes = await Bun.file(output).text();
    await writeArtifact(output, buildTopics(inputs()).pack, true);
    await Bun.write(output, bytes + ' ');
    expect(
      await writeArtifact(output, pack, true).then(
        () => 'unexpected success',
        (error: Error) => error.message,
      ),
    ).toContain('topics.json differs');
    expect(await Bun.file(output).text()).toBe(bytes + ' ');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test('topics --check succeeds through the actual CLI twice without changing committed artifacts', async () => {
  for (let i = 0; i < 2; i++) {
    const result = Bun.spawnSync(['bun', 'scripts/grammar-pack/build.ts', 'topics', '--check'], {
      cwd: new URL('..', import.meta.url).pathname,
    });
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
  }
});
