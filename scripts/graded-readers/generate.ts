/** Owns reader generation CLI parsing, not dispatch, content gates or publication. */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { ReaderSyllabusSchema } from '../../src/types/gradedReader';
import { repositoryRoot } from '../grammar-topics/reference';
import { privateDraftDirectory } from './drafts';
import { generateReader } from './generator';

export const usage = `Usage:
  generate.ts generate --stage <n> [--force] [--retries n] [--model <provider/model>] [--dispatch <script>]
Private inputs: .local/graded-readers/core.json and candidates-<stage>.json.
Private output: .local/graded-readers/drafts-<stage>.json (one draft envelope).
Existing drafts are skipped unless --force is supplied; failures keep the previous draft.
Validation is schema-only, not G0–G5 or language/review approval.
--dispatch replaces pi-dispatch.sh with an executable called as:
  <script> <temporary-directory> <provider/model> <temporary-directory>/task.md <private-log> 900
The child cwd is the temporary directory; write JSON only to out/draft.json.
Environment drops GRAMMAR_REFERENCE_DIR and names containing KEY, TOKEN or SECRET; this is not a sandbox.
Real generation requires owner authorization and a fresh magpie quota check by the lead.`;

if (import.meta.main) {
  try {
    const [command, ...args] = Bun.argv.slice(2);
    if (command === '--help') console.log(usage);
    else if (command === 'generate') {
      const { values } = parseArgs({
        args,
        options: {
          stage: { type: 'string' },
          force: { type: 'boolean' },
          retries: { type: 'string' },
          dispatch: { type: 'string' },
          model: { type: 'string' },
        },
      });
      const stage = Number(values.stage);
      const retries = Number(values.retries ?? '0');
      if (!Number.isSafeInteger(stage) || stage < 1 || stage > 12 || !Number.isSafeInteger(retries) || retries < 0)
        throw new Error(usage);
      const syllabus = ReaderSyllabusSchema.parse(
        await Bun.file(join(repositoryRoot, 'data/graded-readers/syllabus.json')).json(),
      );
      const result = await generateReader(
        { syllabus, stage, retries, force: values.force, dispatch: values.dispatch, model: values.model },
        privateDraftDirectory,
      );
      if (result.failures.length) process.exitCode = 1;
      else console.log(`Stage ${stage}: ${result.skipped ? 'draft skipped' : 'draft written'}`);
    } else throw new Error(usage);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
