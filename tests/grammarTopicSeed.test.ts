/** Synthetic read-only reference seeding probes; no topic text or owner decisions. */
import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proposals, seedManifest } from '../scripts/grammar-topics/seed-manifest';
import { GrammarTagSchema } from '../src/types/grammar';
import { TopicManifestSchema } from '../scripts/grammar-pack/topics';
import manifest from '../data/grammar-topics/manifest.json';

test('all 93 hand proposals have valid unique slugs, one or two tags and the T4 coverage', () => {
  expect(proposals).toHaveLength(93);
  expect(new Set(proposals.map(([, id]) => id)).size).toBe(93);
  const uncovered = [
    'comparison',
    'conditional',
    'passive',
    'plus-que-parfait',
    'relative-pronouns',
    'reported-speech',
    'subjunctive',
    'listening-dictation',
    'reading-comprehension',
    'written-expression',
  ];
  const tags = new Set<string>();
  for (const [reference, id, topicTags] of proposals) {
    expect(reference).toMatch(/^K\d{3}$/);
    expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(['conjugation', 'gender']).not.toContain(id);
    expect(topicTags.length).toBeGreaterThanOrEqual(1);
    expect(topicTags.length).toBeLessThanOrEqual(2);
    for (const tag of topicTags) {
      GrammarTagSchema.parse(tag);
      tags.add(tag);
    }
  }
  expect(tags.size).toBe(27);
  for (const tag of uncovered) expect(tags.has(tag)).toBe(false);
  expect(proposals.filter(([, , tags]) => tags.length === 2)).toHaveLength(14);
});

test('seed groups by first chapter appearance and shared nodes, never overwriting an entry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relire-TEST-seed-'));
  try {
    await mkdir(join(directory, 'topics'));
    const db = new Database(join(directory, 'library.sqlite3'));
    db.exec(
      'CREATE TABLE topic(id TEXT, title TEXT, chapter TEXT, path TEXT, markdown_sha256 TEXT); CREATE TABLE node(id TEXT, parent TEXT, title TEXT, path TEXT, referenced_page INTEGER); CREATE TABLE link(topic TEXT, node TEXT, role TEXT); CREATE TABLE source_ref(id TEXT); CREATE TABLE table_ref(id TEXT); CREATE TABLE review(id TEXT)',
    );
    db.exec(
      "INSERT INTO topic VALUES ('K003','TEST ONLY','TEST FIRST','',''),('K006','TEST ONLY','TEST SECOND','',''),('K007','TEST ONLY','TEST FIRST','',''); INSERT INTO node VALUES ('TEST NODE',NULL,'TEST ONLY','',NULL); INSERT INTO link VALUES ('K003','TEST NODE','primary'),('K006','TEST NODE','primary'),('K007','TEST NODE','related'),('K999','TEST NODE','related')",
    );
    db.close();
    const file = join(directory, 'manifest.json');
    const result = await seedManifest(directory, file);
    expect(result.topics.map((entry) => entry.chapter)).toEqual(['chapter-one', 'chapter-two', 'chapter-one']);
    expect(result.topics[0].related).toEqual(['definite-article-uses', 'articles-proper-names']);
    expect(result.topics.every((entry) => !entry.include)).toBe(true);
    result.topics[0].tags = ['present'];
    result.topics[0].related = [];
    await Bun.write(file, JSON.stringify(result));
    expect((await seedManifest(directory, file)).topics[0]).toEqual(result.topics[0]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('real manifest remains metadata only, with all proposals excluded', () => {
  const parsed = TopicManifestSchema.parse(manifest);
  expect(parsed.topics).toHaveLength(93);
  expect(new Set(parsed.topics.map((entry) => entry.chapter)).size).toBe(10);
  expect(parsed.topics.every((entry) => !entry.include && entry.level === 'A1')).toBe(true);
  for (const entry of parsed.topics) {
    expect(Object.keys(entry).sort()).toEqual(['chapter', 'id', 'include', 'level', 'reference', 'related', 'tags']);
    for (const id of entry.related) expect(parsed.topics.some((topic) => topic.id === id)).toBe(true);
  }
});
