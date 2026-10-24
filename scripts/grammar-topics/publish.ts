/** Owns private reviewed-topic SQL delivery to local D1; assembly and owner review stay in the existing gate. */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildTopics, readTopicInputs, TopicManifestSchema, type TopicBuildInputs } from '../grammar-pack/topics';
import { TopicReviewsSchema, topicContentHash } from '../grammar-pack/gate';
import en from '../../src/i18n/locales/en.json';
import zh from '../../src/i18n/locales/zh.json';

const repository = new URL('../../', import.meta.url);
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function buildPublishSql(input: TopicBuildInputs) {
  const { pack, report } = buildTopics(input);
  // Positions are the 1-based manifest order of included topics; capture them before the id sort below.
  const positions = new Map(pack.topics.map((topic, index) => [topic.id, index + 1]));
  pack.topics.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hashes = pack.topics.map((topic) => topicContentHash(topic));
  const digest = createHash('sha256')
    .update(pack.topics.map((topic, i) => `${topic.id}:${positions.get(topic.id)}:${hashes[i]}`).join('\n'))
    .digest('hex')
    .slice(0, 8);
  const version = `${pack.packVersion}+${digest}`;
  // Wrangler strips explicit transactions; keep replacement rows first and the version last.
  const statements = ['DELETE FROM topics;'];
  for (const [i, topic] of pack.topics.entries()) {
    const values = [
      topic.id,
      topic.chapter,
      topic.level,
      topic.title.en,
      topic.title.zh,
      JSON.stringify(topic.tags),
      JSON.stringify(topic),
      hashes[i],
    ];
    statements.push(
      `INSERT INTO topics (id, chapter, level, title_en, title_zh, tags, body, content_hash, position) VALUES (${values
        .map(quote)
        .join(', ')}, ${positions.get(topic.id)});`,
    );
  }
  statements.push(`INSERT OR REPLACE INTO meta (key, value) VALUES ('packVersion', ${quote(version)});`);
  return { sql: statements.join('\n') + '\n', pack, report, version };
}

export function checkTopicMetadata(
  rawManifest: unknown,
  rawReviews: unknown,
  locales: Record<string, { grammarTopics: { chapters: Record<string, string> } }> = { en, zh },
): void {
  const manifest = TopicManifestSchema.parse(rawManifest);
  const reviews = TopicReviewsSchema.parse(rawReviews);
  const ids = new Set(manifest.topics.map((topic) => topic.id));
  for (const { topicId } of reviews.records)
    if (!ids.has(topicId)) throw new Error(`${topicId}: review names an unknown manifest topic`);
  for (const { chapter } of manifest.topics) {
    for (const [language, locale] of Object.entries(locales)) {
      if (!locale.grammarTopics.chapters[chapter]?.trim())
        throw new Error(`${language}: missing grammarTopics.chapters.${chapter}`);
    }
  }
}

export async function publish(args: string[], root = repository): Promise<void> {
  if (args.length && (args.length !== 1 || !['--apply-local', '--check'].includes(args[0])))
    throw new Error('Usage: publish.ts [--apply-local | --check]');
  if (args[0] === '--check') {
    checkTopicMetadata(
      await Bun.file(new URL('data/grammar-topics/manifest.json', root)).json(),
      await Bun.file(new URL('data/grammar-topics/reviews.json', root)).json(),
    );
    console.log('Topic metadata checked (no private drafts read)');
    return;
  }
  const { sql, pack, report } = buildPublishSql(await readTopicInputs(root));
  const output = new URL('.local/grammar-topics/publish.sql', root);
  await Bun.write(output, sql);
  for (const line of report) console.log(`Skipped: ${line.split(':')[0]}`);
  console.log(`${pack.topics.length} topics prepared: ${fileURLToPath(output)}`);
  if (args[0] === '--apply-local') {
    const child = Bun.spawn(['bunx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--file', fileURLToPath(output)], {
      cwd: fileURLToPath(new URL('worker/', repository)),
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if ((await child.exited) !== 0)
      throw new Error(
        'Local D1 publish failed. If the schema is missing: cd worker && bunx wrangler d1 migrations apply DB --local',
      );
    console.log(`${pack.topics.length} topics published locally`);
  }
}

if (import.meta.main) {
  try {
    await publish(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
