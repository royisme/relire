/** Metadata-only CI check or owner-authorized local-only staged publication using installed Wrangler. */
import { fileURLToPath } from 'node:url';
import type { D1Database } from '../../worker/node_modules/@cloudflare/workers-types';
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
  const proxy = testAdapter
    ? undefined
    : await (
        await import('../../worker/node_modules/wrangler')
      ).getPlatformProxy<{ DB: D1Database }>({
        configPath: fileURLToPath(new URL('worker/wrangler.jsonc', vocabularyRepository)),
        persist: { path: fileURLToPath(new URL('worker/.wrangler/state/v3', vocabularyRepository)) },
        remoteBindings: false,
        envFiles: [],
      });
  try {
    let command = 0;
    const run = async (sql: string, read: boolean, parameters: (string | number)[] = []) => {
      const log = new URL(`.pi-runs/vocabulary/command-${++command}.log`, root);
      try {
        const statement = proxy!.env.DB.prepare(sql).bind(...parameters);
        const output = read ? await statement.all<Record<string, unknown>>() : await statement.run();
        await Bun.write(log, JSON.stringify(output) + '\n');
        if (!output.success || !Array.isArray(output.results)) throw new Error('Invalid local D1 readback');
        return output.results;
      } catch (error) {
        await Bun.write(log, Bun.inspect(error) + '\n');
        throw error;
      }
    };
    const adapter: VocabularyPublishAdapter = testAdapter ?? {
      execute: async (sql, parameters) => {
        await run(sql, false, parameters);
      },
      read: (sql) => run(sql, true),
    };
    await publishVocabularyBook(book, adapter);
  } finally {
    await proxy?.dispose();
  }
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
    // D1 errors can include private content; keep raw failures out of the public console.
    await Bun.write(new URL('.pi-runs/vocabulary/failure.log', vocabularyRepository), Bun.inspect(error) + '\n');
    console.error('Vocabulary publication failed; private diagnostics in .pi-runs/vocabulary/failure.log');
    process.exitCode = 1;
  }
}
