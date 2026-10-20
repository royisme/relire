/** Metadata-only CI check or owner-authorized local-only staged publication using installed Wrangler. */
import { fileURLToPath } from 'node:url';
import { checkVocabularyMetadata, vocabularyRepository } from './metadata';
import {
  prepareArtifact,
  assembleVocabularyBook,
  publishVocabularyBook,
  vocabularyPages,
  sqlQuote,
  type VocabularyPublishAdapter,
} from './publication';
import { canonicalVocabularyJson } from '../../src/services/vocabulary/book';
export async function publish(args: string[], root = vocabularyRepository, testAdapter?: VocabularyPublishAdapter) {
  if (args.length && (args.length !== 1 || !['--check', '--apply-local', '--apply-local-unreviewed'].includes(args[0])))
    throw new Error('Usage: publish.ts [--check | --apply-local | --apply-local-unreviewed]');
  const unreviewed = args[0] === '--apply-local-unreviewed';
  const { manifest, reviews } = checkVocabularyMetadata(
    await Bun.file(new URL('data/vocabulary/manifest.json', root)).json(),
    await Bun.file(new URL('data/vocabulary/reviews.json', root)).json(),
  );
  if (args[0] === '--check') {
    console.log('Vocabulary metadata checked; no private content read or published');
    return;
  }
  const artifact = await prepareArtifact(root);
  const { contentHash, ...metadata } = manifest;
  if (
    contentHash !== artifact.contentHash ||
    canonicalVocabularyJson(metadata) !== canonicalVocabularyJson(artifact.metadata)
  )
    throw new Error('Vocabulary manifest does not match prepared content');
  const review = unreviewed
    ? { bookId: 'tcf-7000' as const, contentHash: artifact.contentHash, status: 'unreviewed' as const }
    : reviews.records.findLast((r) => r.contentHash === artifact.contentHash);
  if (!review) throw new Error('Vocabulary requires an actual matching review');
  const book = await assembleVocabularyBook(artifact, review);
  const statements = vocabularyPages(book).map(
    (page) =>
      `INSERT OR IGNORE INTO vocabulary_pages (book_id, version, page, body) VALUES ('tcf-7000', ${sqlQuote(book.manifest.version)}, ${page.page}, ${sqlQuote(canonicalVocabularyJson(page))});`,
  );
  statements.push(
    '-- Staging only. Publication marker/current pointer require verified local publication after body readback.',
  );
  await Bun.write(new URL('.local/vocabulary/publish.sql', root), statements.join('\n') + '\n');
  if (args[0] !== '--apply-local' && !unreviewed) {
    console.log('Private immutable staging SQL prepared only; --apply-local performs verified publication');
    return;
  }
  let command = 0;
  const run = async (sql: string, read: boolean) => {
    const file = new URL(`.local/vocabulary/command-${++command}.sql`, root);
    await Bun.write(file, sql + '\n');
    const child = Bun.spawn(
      [
        fileURLToPath(new URL('worker/node_modules/.bin/wrangler', vocabularyRepository)),
        'd1',
        'execute',
        'DB',
        '--local',
        '--json',
        '--file',
        fileURLToPath(file),
      ],
      {
        cwd: fileURLToPath(new URL('worker/', vocabularyRepository)),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    await Bun.write(new URL(`.pi-runs/vocabulary/command-${command}.log`, root), stdout + '\n' + stderr);
    if (exit !== 0)
      throw new Error(`Local vocabulary command ${command} failed (${exit}); private output in .pi-runs/vocabulary/`);
    if (!read) return [];
    const output = JSON.parse(stdout) as { success: boolean; results: Record<string, unknown>[] }[];
    if (output.length !== 1 || !output[0].success || !Array.isArray(output[0].results))
      throw new Error('Invalid local D1 readback');
    return output[0].results;
  };
  const adapter: VocabularyPublishAdapter = testAdapter ?? {
    execute: async (sql) => {
      await run(sql, false);
    },
    read: (sql) => run(sql, true),
  };
  await publishVocabularyBook(book, adapter);
  console.log(
    unreviewed
      ? 'Unreviewed vocabulary current pointer verified locally; linguistic review waived for local use'
      : 'Vocabulary current pointer verified locally',
  );
}
if (import.meta.main) {
  try {
    await publish(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
