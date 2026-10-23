/** Owns isolated stage dispatch, pre-validation normalization and draft persistence, not G0–G5 or review. */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { ReaderSyllabusSchema, type ReaderSyllabus, type ReaderGlossaryEntry } from '../../src/types/gradedReader';
import { normalizeLookupToken } from '../../src/services/grammarPack/lookup';
import { vocabularyHash } from '../../src/services/vocabulary/book';
import { repositoryRoot } from '../grammar-topics/reference';
import { notYetIntroduced } from './gateCompleteness';
import { policyHash } from './gateInputs';
import {
  ReaderDraftSchema,
  ReaderDraftOutputSchema,
  readDraft,
  readCore,
  readCandidates,
  storeDraft,
  type ReaderDraft,
} from './drafts';

/** Default author model. Review runs on another family (the owner chose Gemini 3.8), so the author is never Gemini. */
export const model = 'openai-codex/gpt-6.1-sol';
export const promptFile = new URL('./prompt.txt', import.meta.url);

function normalize(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    const french = [
      'fr',
      'lemma',
      'headword',
      'forms',
      'quote',
      'prompt',
      'expectedAnswer',
      'acceptableAnswers',
      'answer',
    ].includes(key);
    return french ? value.normalize('NFC').replace(/['‘]/g, '’') : value.normalize('NFC');
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, key));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, normalize(item, name)]));
  return value;
}

export interface GenerateOptions {
  syllabus: ReaderSyllabus;
  stage: number;
  force?: boolean;
  retries: number;
  dispatch?: string;
  model?: string;
  /** Short watchdog for fake-dispatch tests; the CLI always uses fifteen minutes. */
  timeoutMs?: number;
}
export interface Failure {
  outcome: 'invalid-json' | 'schema' | 'no-output' | 'dispatch' | 'timeout';
  detail: string;
  temporary: string;
  log: string;
}

export async function generateReader(options: GenerateOptions, directory: string) {
  const syllabus = ReaderSyllabusSchema.parse(options.syllabus);
  const stage = syllabus.stages.find((row) => row.order === options.stage);
  if (!stage) throw new Error(`Unknown stage ${options.stage}`);
  if (!Number.isSafeInteger(options.retries) || options.retries < 0)
    throw new Error('Retries must be a nonnegative integer');
  if (!options.force && (await readDraft(directory, stage.order))) return { skipped: true, failures: [] as Failure[] };

  const core = await readCore(directory);
  const candidates = await readCandidates(directory, stage.order);
  const previous: ReaderDraft[] = [];
  // Drafts form the authoring sequence even while the public syllabus is entirely excluded.
  for (const row of syllabus.stages.slice(0, stage.order - 1)) {
    const draft = await readDraft(directory, row.order);
    if (!draft || draft.body.id !== row.readerId || draft.body.order !== row.order)
      throw new Error(`Missing matching draft for earlier stage ${row.order} (${row.readerId})`);
    previous.push(draft);
  }
  // The author only sees core words the stage inventory has introduced (G5 would reject the rest).
  const availableCore = core.filter((entry) => !notYetIntroduced(entry.headword, stage.order));
  const known = new Map<string, Omit<ReaderGlossaryEntry, 'id'> & { id?: string }>();
  for (const entry of [
    ...availableCore.map(({ headword, ...entry }) => ({ ...entry, lemma: headword })),
    ...previous.flatMap((draft) => draft.body.glossary),
  ]) {
    const key = JSON.stringify([entry.pos, normalizeLookupToken(entry.lemma), entry.sense]);
    const before = known.get(key);
    known.set(key, { ...entry, forms: [...new Set([...(before?.forms ?? []), ...entry.forms])] });
  }
  const inputs: Record<string, unknown> = {
    STAGE: stage,
    CORE: availableCore,
    KNOWN: [...known.values()],
    CANDIDATES: candidates,
  };
  const template = await Bun.file(promptFile).text();
  const prompt = template.replace(/\{\{(STAGE|CORE|KNOWN|CANDIDATES)\}\}/g, (_, key: string) =>
    JSON.stringify(inputs[key], null, 2),
  );
  const provenance: ReaderDraft['provenance'] = {
    origin: 'ai-authored',
    model: options.model ?? model,
    generatedAt: new Date().toISOString().slice(0, 10),
    promptHash: createHash('sha256').update(prompt).digest('hex'),
    syllabusHash: policyHash(syllabus, core, stage.order),
    dependencyHashes: await Promise.all(
      previous.map(async (draft) => ({ readerId: draft.body.id, contentHash: await vocabularyHash(draft.body) })),
    ),
  };
  const outputSchema = ReaderDraftOutputSchema.safeExtend({
    body: ReaderDraftSchema.shape.body.safeExtend({
      id: z.literal(stage.readerId),
      order: z.literal(stage.order),
      topics: z
        .array(ReaderDraftSchema.shape.body.shape.topics.element)
        .refine((topics) => JSON.stringify(topics) === JSON.stringify(stage.topicIds), 'Topics must match the stage'),
    }),
  });
  const logs = join(directory, 'runs');
  await mkdir(logs, { recursive: true });
  const runDirectory = await mkdtemp(join(logs, `${Date.now()}-`));
  const limit = options.timeoutMs ?? 900_000;
  let failures: Failure[] = [];
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    const temporary = await mkdtemp(join(tmpdir(), 'relire-TEST-or-private-reader-'));
    const log = join(runDirectory, `${attempt + 1}.log`);
    await Bun.write(join(temporary, 'schema.json'), JSON.stringify(z.toJSONSchema(outputSchema), null, 2));
    await Bun.write(join(temporary, 'task.md'), prompt);
    await Bun.write(log, '');
    const dispatchOutput = await open(join(runDirectory, `${attempt + 1}-dispatch.log`), 'w');
    let failure: Pick<Failure, 'outcome' | 'detail'> | undefined;
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => name !== 'GRAMMAR_REFERENCE_DIR' && !/KEY|TOKEN|SECRET/i.test(name),
        ),
      );
      const child = Bun.spawn(
        [
          options.dispatch ? resolve(options.dispatch) : join(repositoryRoot, 'scripts/pi-dispatch.sh'),
          temporary,
          options.model ?? model,
          join(temporary, 'task.md'),
          log,
          String(Math.ceil(limit / 1000)),
        ],
        { cwd: temporary, env, stdout: dispatchOutput.fd, stderr: dispatchOutput.fd, timeout: limit },
      );
      const code = await child.exited;
      if (child.signalCode || code === 124)
        failure = {
          outcome: 'timeout',
          detail: `Dispatch timeout or signal: exit ${code}, signal ${child.signalCode ?? 'none'}`,
        };
      else if (code !== 0) failure = { outcome: 'dispatch', detail: `Dispatch exit code ${code}` };
    } catch (error) {
      failure = { outcome: 'dispatch', detail: String(error) };
    } finally {
      await dispatchOutput.close();
    }
    let draft: ReaderDraft | undefined;
    if (!failure) {
      const output = Bun.file(join(temporary, 'out/draft.json'));
      if (!(await output.exists())) failure = { outcome: 'no-output', detail: 'Missing out/draft.json' };
      else {
        let value: unknown;
        try {
          value = normalize(JSON.parse(await output.text()));
        } catch (error) {
          failure = { outcome: 'invalid-json', detail: String(error) };
        }
        if (!failure) {
          const parsed = outputSchema.safeParse(value);
          if (!parsed.success) failure = { outcome: 'schema', detail: parsed.error.message };
          else {
            const full = ReaderDraftSchema.safeParse({ ...parsed.data, provenance });
            if (!full.success) failure = { outcome: 'schema', detail: full.error.message };
            else draft = full.data;
          }
        }
      }
    }
    if (draft) {
      await storeDraft(directory, stage.order, draft);
      await rm(temporary, { recursive: true, force: true });
      return { skipped: false, failures: [] as Failure[], runDirectory };
    }
    const record = { ...failure!, temporary, log };
    failures = [record];
    console.error(`Stage ${stage.order}: ${record.outcome}\n${record.detail}\nlog: ${log}\nkept temp: ${temporary}`);
  }
  return { skipped: false, failures, runDirectory };
}
