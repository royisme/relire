/** Owns generation/sheet command parsing; dispatch and validation live in generator.ts. */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { TopicManifestSchema } from '../grammar-pack/topics';
import { privateDraftDirectory } from './drafts';
import { generateTopics } from './generator';
import { repositoryRoot } from './reference';
import { sheet } from './sheet';

export const usage = `Usage:
  generate.ts generate --chapter <id> [--only K016,K017] [--force] [--retries 2] [--dispatch <script>] [--reference <directory>]
  generate.ts sheet [--chapter <id>] [--status draft]
Reference: --reference takes precedence over GRAMMAR_REFERENCE_DIR; no default.
Private drafts: .local/grammar-topics/ (never committed).
--dispatch replaces pi-dispatch.sh with an executable called as:
  <script> <temporary-directory> antigravity/gemini-3.8-flash <temporary-directory>/dispatch.md <temporary-directory>/log 900
The child cwd is the temporary directory. It writes out/<reference>.json and may append to the log.
Environment drops GRAMMAR_REFERENCE_DIR and names containing KEY, TOKEN or SECRET; this is not a sandbox.`;

if (import.meta.main) {
  try {
    const [command, ...args] = Bun.argv.slice(2);
    if (command === '--help') console.log(usage);
    else if (command === 'generate') {
      const { values } = parseArgs({
        args,
        options: {
          chapter: { type: 'string' },
          only: { type: 'string' },
          force: { type: 'boolean' },
          retries: { type: 'string' },
          dispatch: { type: 'string' },
          reference: { type: 'string' },
        },
      });
      const retries = Number(values.retries ?? '0');
      if (!values.chapter || !Number.isSafeInteger(retries) || retries < 0 || values.only === '')
        throw new Error(usage);
      const manifest = TopicManifestSchema.parse(
        await Bun.file(join(repositoryRoot, 'data/grammar-topics/manifest.json')).json(),
      );
      const { failures } = await generateTopics(
        {
          manifest,
          chapter: values.chapter,
          only: values.only?.split(','),
          force: values.force,
          retries,
          dispatch: values.dispatch,
          reference: values.reference ?? process.env.GRAMMAR_REFERENCE_DIR,
        },
        privateDraftDirectory,
      );
      if (failures.length) process.exitCode = 1;
    } else if (command === 'sheet') {
      const { values } = parseArgs({ args, options: { chapter: { type: 'string' }, status: { type: 'string' } } });
      console.log(await sheet(privateDraftDirectory, values.chapter, values.status));
    } else throw new Error(usage);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
