/** Owns private reviewed-topic SQL delivery to local D1; assembly and owner review stay in the existing gate. */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { d1ExecuteSpawn } from '../content-service/d1Target';
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
  // Wrangler strips explicit transactions; invalidate the old version before replacing rows.
  const statements = ["DELETE FROM meta WHERE key = 'packVersion';", 'DELETE FROM topics;'];
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

export function parseArgs(args: string[]) {
  if (args.length && (args.length !== 1 || !['--apply-local', '--check'].includes(args[0])))
    throw new Error('Usage: publish.ts [--apply-local | --check]');
  return args[0];
}

export async function publish(
  args: string[],
  root = repository,
  { allowRemote = false }: { allowRemote?: boolean } = {},
): Promise<void> {
  // Reserved for the owner-only remote mode; no remote flags are accepted yet.
  void allowRemote;
  try {
    const mode = parseArgs(args);
    if (mode === '--check') {
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
    if (mode === '--apply-local') {
      const child = Bun.spawn({
        ...d1ExecuteSpawn(root, false, 'd1', 'execute', 'DB', '--file', fileURLToPath(output)),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (exitCode !== 0) throw new Error(`Local D1 publish failed (${exitCode})\n${stdout}${stderr}`);
    }
    for (const line of report) console.log(`Skipped: ${line.split(':')[0]}`);
    console.log(`${pack.topics.length} topics prepared: ${fileURLToPath(output)}`);
    if (mode === '--apply-local') console.log(`${pack.topics.length} topics published locally`);
  } catch (error) {
    await Bun.write(new URL('.pi-runs/grammar-topics/failure.log', root), Bun.inspect(error) + '\n');
    console.error('Topic publication failed; private diagnostics in .pi-runs/grammar-topics/failure.log');
    throw error;
  }
}

if (import.meta.main) {
  try {
    await publish(Bun.argv.slice(2), repository, { allowRemote: true });
  } catch {
    process.exitCode = 1;
  }
}
