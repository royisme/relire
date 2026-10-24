/** Metadata-only CI check or owner-authorized staged publication using installed Wrangler; no deployment. */
import { platformProxyOptions } from '../content-service/d1Target';
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
export function parseArgs(args: string[]) {
  if (
    args.length &&
    (args.length !== 1 ||
      !['--check', '--apply-local', '--apply-local-unreviewed', '--apply-remote-unreviewed'].includes(args[0]))
  )
    throw new Error(
      'Usage: publish.ts [--check | --apply-local | --apply-local-unreviewed | --apply-remote-unreviewed]',
    );
  return args[0];
}

export async function publish(
  args: string[],
  root = vocabularyRepository,
  testAdapter?: VocabularyPublishAdapter,
  { allowRemote = false }: { allowRemote?: boolean } = {},
) {
  try {
    const mode = parseArgs(args);
    const remote = mode === '--apply-remote-unreviewed';
    if (remote && !allowRemote) throw new Error('Remote publication requires owner CLI authorization');
    if (remote && !(process.stdin.isTTY && process.stdout.isTTY))
      throw new Error('Remote publication requires TTY stdin and stdout');
    const unreviewed = mode === '--apply-local-unreviewed' || remote;
    const { manifest, reviews } = checkVocabularyMetadata(
      await Bun.file(new URL('data/vocabulary/manifest.json', root)).json(),
      await Bun.file(new URL('data/vocabulary/reviews.json', root)).json(),
    );
    if (mode === '--check') {
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
      '-- Staging only. Publication marker/current pointer require verified publication after body readback.',
    );
    await Bun.write(new URL('.local/vocabulary/publish.sql', root), statements.join('\n') + '\n');
    if (mode !== '--apply-local' && !unreviewed) {
      console.log('Private immutable staging SQL prepared only; --apply-local performs verified publication');
      return;
    }
    const { getPlatformProxy } = testAdapter
      ? { getPlatformProxy: undefined }
      : await import(new URL('worker/node_modules/wrangler/wrangler-dist/cli.js', root).href);
    const proxy: { env: { DB: D1Database }; dispose(): Promise<void> } | undefined = await getPlatformProxy?.(
      platformProxyOptions(root, remote),
    );
    try {
      let command = 0;
      const run = async (sql: string, read: boolean, parameters: (string | number)[] = []) => {
        const log = new URL(`.pi-runs/vocabulary/command-${++command}.log`, root);
        try {
          const statement = proxy!.env.DB.prepare(sql).bind(...parameters);
          const output = read ? await statement.all<Record<string, unknown>>() : await statement.run();
          await Bun.write(log, JSON.stringify(output) + '\n');
          if (!output.success || !Array.isArray(output.results)) throw new Error('Invalid D1 readback');
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
      remote
        ? 'Unreviewed vocabulary current pointer verified remotely; no linguistic review'
        : unreviewed
          ? 'Unreviewed vocabulary current pointer verified locally; linguistic review waived for local use'
          : 'Vocabulary current pointer verified locally',
    );
  } catch (error) {
    // D1 errors can include private content; keep raw failures out of the public console.
    await Bun.write(new URL('.pi-runs/vocabulary/failure.log', root), Bun.inspect(error) + '\n');
    console.error('Vocabulary publication failed; private diagnostics in .pi-runs/vocabulary/failure.log');
    throw error;
  }
}
if (import.meta.main) {
  try {
    await publish(Bun.argv.slice(2), vocabularyRepository, undefined, { allowRemote: true });
  } catch {
    process.exitCode = 1;
  }
}
