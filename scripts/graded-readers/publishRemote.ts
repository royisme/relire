/** Owns owner-authorized reader publication via installed Wrangler; no deployment or env files. */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { platformProxyOptions, requireInteractiveTerminal } from '../content-service/d1Target';
import type { D1Database } from '../../worker/node_modules/@cloudflare/workers-types';
import { repositoryRoot } from '../grammar-topics/reference';
import { assemble } from './assemble';
import { loadReviewInputs, readReviewMetadata } from './reviewInputs';
import { prepareReaderPublication, publishReaders, sqlQuote } from './publication';

export function parseArgs(args: string[]) {
  if (args.length !== 1 || !['--sql', '--apply-local', '--apply-remote'].includes(args[0]))
    throw new Error('Usage: publishRemote.ts --sql | --apply-local | --apply-remote');
  return args[0];
}

export async function runPublishRemote(
  args: string[],
  root = repositoryRoot,
  { allowRemote = false }: { allowRemote?: boolean } = {},
): Promise<void> {
  try {
    const mode = parseArgs(args);
    const remote = mode === '--apply-remote';
    if (remote && !allowRemote) throw new Error('Remote publication requires owner CLI authorization');
    if (remote) requireInteractiveTerminal(Boolean(process.stdin.isTTY), Boolean(process.stdout.isTTY));
    const { syllabus, reviews } = await readReviewMetadata(root);
    const remoteIds = new Set(
      syllabus.stages.filter((stage) => stage.include && !stage.bundled).map((stage) => stage.readerId),
    );
    if (!remoteIds.size) {
      console.log('No non-bundled readers selected; nothing to publish.');
      return;
    }
    // Keep the included prefix intact: gates need all earlier stages and their current reviews.
    const orders = syllabus.stages.filter((stage) => stage.include).map((stage) => stage.order);
    const inputs = await loadReviewInputs(root, syllabus, orders);
    const readers = assemble(inputs.drafts, reviews, syllabus, inputs.context).filter((reader) =>
      remoteIds.has(reader.body.id),
    );
    const prepared = await prepareReaderPublication(readers, syllabus.syllabusVersion);
    if (mode === '--sql') {
      const statements = prepared.artifacts.map(({ reader, hash, body }) => {
        const values = [
          sqlQuote(reader.body.id),
          sqlQuote(hash),
          sqlQuote(reader.version),
          reader.body.order,
          sqlQuote(body),
        ];
        return `INSERT OR IGNORE INTO readers (id, artifact_hash, body_version, stage_order, body) VALUES (${values.join(', ')});`;
      });
      statements.push(
        '-- Staging only. Use --apply-local or --apply-remote for verified readback, markers, catalogue and pointer.',
      );
      await Bun.write(join(root, '.local/graded-readers/publish.sql'), statements.join('\n') + '\n');
      console.log(`${readers.length} reader(s) prepared as private staging SQL only.`);
      return;
    }
    const { getPlatformProxy } = await import(
      pathToFileURL(join(root, 'worker/node_modules/wrangler/wrangler-dist/cli.js')).href
    );
    const proxy: { env: { DB: D1Database }; dispose(): Promise<void> } = await getPlatformProxy(
      platformProxyOptions(root, remote),
    );
    try {
      await publishReaders(prepared, {
        execute: async (sql, parameters = []) => {
          const result = await proxy.env.DB.prepare(sql)
            .bind(...parameters)
            .run();
          if (!result.success) throw new Error('Reader D1 write failed');
        },
        read: async (sql) => {
          const result = await proxy.env.DB.prepare(sql).all<Record<string, unknown>>();
          if (!result.success) throw new Error('Reader D1 read failed');
          return result.results;
        },
      });
    } finally {
      await proxy.dispose();
    }
    console.log(
      `${readers.length} reader(s) published and current pointer verified ${remote ? 'remotely' : 'locally'}.`,
    );
  } catch (error) {
    // Raw D1/schema errors can contain private prose, so diagnostics stay ignored.
    await Bun.write(join(root, '.pi-runs/graded-readers/publish-failure.log'), Bun.inspect(error) + '\n');
    console.error('Reader publication failed; private diagnostics in .pi-runs/graded-readers/publish-failure.log');
    throw error;
  }
}
if (import.meta.main) {
  try {
    await runPublishRemote(Bun.argv.slice(2), repositoryRoot, { allowRemote: true });
  } catch {
    process.exitCode = 1;
  }
}
