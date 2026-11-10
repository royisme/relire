/** Owns sequential isolated dispatch, validation and private draft writes; not CLI parsing or owner review. */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { TopicManifest } from '../grammar-pack/topics';
import { DraftOutputSchema, PrivateDraftSchema, readDrafts, storeDraft, type PrivateDraft } from './drafts';
import { referenceDirectory, repositoryRoot } from './reference';

export const model = 'antigravity/gemini-3.8-flash';
export const promptFile = new URL('./prompt.txt', import.meta.url);
export function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 8);
}

function normalize(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    // Keep the field classification aligned with scanTopicStrings, including array elements.
    const french = ['fr', 'prompt', 'expectedAnswer', 'acceptableAnswers', 'answer'].includes(key);
    return french ? value.normalize('NFC').replace(/['‘]/g, '’') : value.normalize('NFC');
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, key));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item, key)]));
  return value;
}

export interface GenerateOptions {
  manifest: TopicManifest;
  reference: string | undefined;
  chapter: string;
  only?: string[];
  force?: boolean;
  retries: number;
  dispatch?: string;
}
export interface Failure {
  id: string;
  outcome: 'no-output' | 'invalid-json' | 'schema' | 'language-check' | 'dispatch' | 'timeout';
  detail: string;
  log: string;
  temporary: string;
}

function issues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
}

export async function generateTopics(options: GenerateOptions, outputDirectory: string) {
  const reference = await referenceDirectory(options.reference);
  const chapter = options.manifest.topics.filter((entry) => entry.chapter === options.chapter);
  if (!chapter.length) throw new Error(`Unknown chapter ${options.chapter}`);
  for (const ref of options.only ?? []) {
    if (!chapter.some((entry) => entry.reference === ref)) throw new Error(`${ref}: not in chapter ${options.chapter}`);
  }
  const selected = chapter.filter((entry) => !options.only || options.only.includes(entry.reference));
  const drafts = await readDrafts(outputDirectory, options.chapter);
  let pending = selected.filter((entry) => {
    const valid = drafts.some((value) => {
      const parsed = PrivateDraftSchema.safeParse(value);
      return parsed.success && parsed.data.id === entry.id;
    });
    if (valid && !options.force) console.log(`${entry.id}: valid draft; skipped`);
    return !valid || options.force;
  });
  const prompt = await Bun.file(promptFile).text();
  const logs = join(repositoryRoot, '.pi-runs/grammar-topics');
  await mkdir(logs, { recursive: true });
  const runDirectory = await mkdtemp(join(logs, `${Date.now()}-`));
  let failures: Failure[] = [];
  let groupNumber = 0;
  for (let attempt = 0; attempt <= options.retries && pending.length; attempt++) {
    const failed: typeof pending = [];
    failures = [];
    for (let start = 0; start < pending.length; start += 6) {
      const group = pending.slice(start, start + 6);
      const temporary = await mkdtemp(join(tmpdir(), 'relire-grammar-topics-'));
      const number = ++groupNumber;
      const log = join(runDirectory, `${number}.log`);
      const sources = new Map<string, string>();
      await mkdir(join(temporary, 'topics'));
      for (const entry of group) {
        const source = await Bun.file(join(reference, 'topics', `${entry.reference}.md`)).text();
        sources.set(entry.reference, source);
        await Bun.write(join(temporary, 'topics', `${entry.reference}.md`), source);
      }
      await Bun.write(join(temporary, 'schema.json'), JSON.stringify(z.toJSONSchema(DraftOutputSchema), null, 2));
      await Bun.write(join(temporary, 'task.md'), prompt);
      await Bun.write(join(temporary, 'dispatch.md'), 'do the task in task.md\n');
      await Bun.write(join(temporary, 'log'), '');
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => name !== 'GRAMMAR_REFERENCE_DIR' && !/KEY|TOKEN|SECRET/i.test(name),
        ),
      );
      let code: number | undefined;
      let dispatchError: string | undefined;
      const dispatchOutput = await open(join(temporary, 'dispatch-output.log'), 'w');
      try {
        const child = Bun.spawn(
          [
            options.dispatch ? resolve(options.dispatch) : join(repositoryRoot, 'scripts/pi-dispatch.sh'),
            temporary,
            model,
            join(temporary, 'dispatch.md'),
            join(temporary, 'log'),
            '900',
          ],
          { cwd: temporary, env, stdout: dispatchOutput.fd, stderr: dispatchOutput.fd, timeout: 900_000 },
        );
        code = await child.exited;
        if (child.signalCode === 'SIGTERM' || child.signalCode === 'SIGKILL')
          dispatchError = `timeout or signal ${child.signalCode}`;
      } catch (error) {
        dispatchError = String(error);
      } finally {
        await dispatchOutput.close();
      }
      await copyFile(join(temporary, 'log'), log);
      const outputLog = Bun.file(join(temporary, 'dispatch-output.log'));
      if (await outputLog.exists()) await copyFile(outputLog.name!, join(runDirectory, `${number}-dispatch.log`));
      let groupFailed = false;
      for (const entry of group) {
        let failure: Pick<Failure, 'outcome' | 'detail'> | undefined;
        let draft: PrivateDraft | undefined;
        if (dispatchError) failure = { outcome: code !== undefined ? 'timeout' : 'dispatch', detail: dispatchError };
        else if (code !== 0)
          failure = { outcome: 'dispatch', detail: `exit code ${code}${code === 124 ? ' (watchdog gave up)' : ''}` };
        else {
          const output = Bun.file(join(temporary, 'out', `${entry.reference}.json`));
          if (!(await output.exists()))
            failure = { outcome: 'no-output', detail: `Missing out/${entry.reference}.json` };
          else {
            let value: unknown;
            try {
              value = normalize(JSON.parse(await output.text()));
            } catch (error) {
              failure = { outcome: 'invalid-json', detail: String(error) };
            }
            if (!failure) {
              const parsed = DraftOutputSchema.safeParse(value);
              if (!parsed.success) failure = { outcome: 'schema', detail: issues(parsed.error) };
              else {
                const { include: _include, reference: ref, ...metadata } = entry;
                const full = PrivateDraftSchema.safeParse({
                  ...parsed.data,
                  ...metadata,
                  status: 'draft',
                  provenance: {
                    origin: 'ai-regenerated',
                    referenceSet: 'a1-grammar-full',
                    reference: ref,
                    model,
                    generatedAt: new Date().toISOString().slice(0, 10),
                    promptHash: promptHash(prompt),
                  },
                });
                if (!full.success) {
                  const language = full.error.issues.some((issue) => /CJK|NFC|apostrophe/.test(issue.message));
                  failure = { outcome: language ? 'language-check' : 'schema', detail: issues(full.error) };
                } else {
                  draft = full.data;
                  draft.warnings = [];
                  const blocks = [
                    ...draft.blocks.map((block, i) => ({ block, path: `blocks.${i}` })),
                    ...(draft.learning?.checkpoints.flatMap((checkpoint, i) =>
                      checkpoint.teaching.map((block, j) => ({
                        block,
                        path: `learning.checkpoints.${i}.teaching.${j}`,
                      })),
                    ) ?? []),
                  ];
                  blocks.forEach(({ block, path }) => {
                    if (block.type === 'examples')
                      block.items.forEach((example, j) => {
                        if (sources.get(ref)!.includes(example.fr))
                          draft!.warnings!.push(`${path}.items.${j}.fr: verbatim example in reference ${ref}`);
                      });
                  });
                }
              }
            }
          }
        }
        if (failure) {
          groupFailed = true;
          failed.push(entry);
          const record = { id: entry.id, ...failure, log, temporary };
          failures.push(record);
          console.error(`${record.id}: ${record.outcome}\n${record.detail}\nlog: ${log}\nkept temp: ${temporary}`);
        } else if (draft) {
          await storeDraft(outputDirectory, options.chapter, draft);
          console.log(`${entry.id}: draft written${draft.warnings?.length ? '\n' + draft.warnings.join('\n') : ''}`);
        }
      }
      if (!groupFailed) await rm(temporary, { recursive: true, force: true });
    }
    pending = failed;
  }
  return { failures, runDirectory };
}
