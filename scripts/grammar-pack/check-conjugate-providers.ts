/**
 * Owner-run check of the `conjugateVerb` prompt against real providers (#21): the four cases, which providers
 * the environment configures, one run of the app's own path, the failure table and the ignored report.
 * Not part of CI; no key is ever printed or written.
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import i18n from '../../src/i18n';
import { createByokAccess } from '../../src/services/ai/access';
import { normalizeBaseUrl } from '../../src/services/ai/baseUrl';
import { normalizeModelId } from '../../src/services/ai/catalogue';
import { errorMessage, InvalidAnswerError } from '../../src/services/ai/errors';
import { textProviders } from '../../src/services/ai/providers';
import { conjugateVerb } from '../../src/services/ai/tasks';
import type { JsonRequest, TextExecution } from '../../src/services/ai/types';
import { verifyAnswer, type VerifiedVerb } from '../../src/services/conjugation/verify';
import { TENSES, type Tense } from '../../src/types/grammarPack';
import { getAppSettings, saveAppSettings } from '../../src/utils/appSettings';

/** Edit this list to change what the check asks: a regular, an irregular, a pronominal and an h-initial verb. */
export const CASES = ['parler', 'prendre', 'se lever', 'haïr'] as const;

const DEFAULT_REPEAT = 3;
const PREVIEW_LENGTH = 300;

type Environment = Record<string, string | undefined>;

const variable = (prefix: string, providerId: string) =>
  `RELIRE_${prefix}_${providerId.toUpperCase().replaceAll('-', '_')}`;

/** The only source of a key: `RELIRE_KEY_<ID>`, upper-cased with `-` as `_` (a file is never read). */
export const keyVariable = (providerId: string) => variable('KEY', providerId);

export interface ProviderRun {
  id: string;
  model: string;
  baseUrl?: string;
  /** In memory only, never printed and never written. */
  key: string;
}

export interface SkippedProvider {
  id: string;
  reason: string;
}

export interface Plan {
  runs: ProviderRun[];
  skipped: SkippedProvider[];
}

/**
 * Which providers would call: every registered text provider that needs a key (or the ones named), with the
 * model from `RELIRE_MODEL_<ID>` or the provider's catalogue default, and the endpoint from `RELIRE_BASEURL_<ID>`.
 * Anything unusable is skipped with its reason, so nothing is silently dropped.
 */
export function planProviders(environment: Environment, requested: readonly string[] = []): Plan {
  const eligible = textProviders().filter((provider) => provider.info.requiresKey !== false);
  const chosen = requested.length
    ? requested.flatMap((id) => eligible.filter((provider) => provider.info.id === id))
    : eligible;
  const skipped: SkippedProvider[] = requested
    .filter((id) => !eligible.some((provider) => provider.info.id === id))
    .map((id) => ({ id, reason: 'not a registered text provider that needs a key' }));
  const runs: ProviderRun[] = [];
  for (const provider of chosen) {
    const id = provider.info.id;
    const key = environment[keyVariable(id)]?.trim() ?? '';
    if (!key) {
      skipped.push({ id, reason: `${keyVariable(id)} is not set` });
      continue;
    }
    const modelVariable = variable('MODEL', id);
    const rawModel = environment[modelVariable]?.trim();
    const model = rawModel ? normalizeModelId(rawModel) : provider.info.text?.defaultModel;
    if (!model) {
      skipped.push({
        id,
        reason: rawModel ? `${modelVariable} is not a usable model ID` : `no default model; set ${modelVariable}`,
      });
      continue;
    }
    const baseUrlVariable = variable('BASEURL', id);
    const rawBaseUrl = environment[baseUrlVariable]?.trim();
    const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : undefined;
    if (rawBaseUrl && !baseUrl) {
      skipped.push({ id, reason: `${baseUrlVariable} is not an http(s) endpoint` });
      continue;
    }
    runs.push({ id, model, ...(baseUrl && { baseUrl }), key });
  }
  return { runs, skipped };
}

const HEADER_TEXT = /\b(authorization|x-api-key|x-goog-api-key)\b["']?\s*[:=]\s*["']?(?:bearer\s+)?[^\s,;"']+/gi;

/** Text safe to print or store: every key value, and any header-like `name: value`, is replaced. */
export function redact(text: string, secrets: readonly string[]): string {
  const withoutKeys = secrets.reduce((out, secret) => (secret ? out.split(secret).join('[redacted]') : out), text);
  return withoutKeys.replace(HEADER_TEXT, '[redacted]');
}

export type RunClassification =
  | { kind: 'ok'; status: VerifiedVerb['status'] }
  | { kind: 'engine'; cells: number; tenses: Tense[]; participles: string[]; status: VerifiedVerb['status'] }
  | { kind: 'schema'; issue: string }
  | { kind: 'json'; message: string }
  | { kind: 'request'; message: string };

export interface RunRecord {
  provider: string;
  model: string;
  verb: string;
  ms: number;
  classification: RunClassification;
  /** Failures only: the answer the provider returned, cut short and redacted; absent when there was no answer. */
  answerPreview?: string;
}

/** `partly-differs` is the only engine disagreement; `ai-only` means nothing independent could be compared. */
export function classifyAnswer(verified: VerifiedVerb): RunClassification {
  if (verified.status !== 'partly-differs') return { kind: 'ok', status: verified.status };
  const differing = TENSES.flatMap((tense) =>
    Object.values(verified.tenses[tense])
      .filter((cell) => cell.status === 'differs')
      .map(() => tense),
  );
  const participles = Object.entries(verified.participles)
    .filter(([, participle]) => participle.status === 'differs')
    .map(([key]) => key);
  return {
    kind: 'engine',
    cells: differing.length,
    tenses: [...new Set(differing)],
    participles,
    status: verified.status,
  };
}

/** The provider parses JSON itself, so its one "could not be read" message is the only signal of a parse failure. */
export function classifyFailure(error: unknown, secrets: readonly string[]): RunClassification {
  if (error instanceof InvalidAnswerError) return { kind: 'schema', issue: error.issues[0] };
  const message = redact(errorMessage(error), secrets);
  return message === i18n.t('errors.badResponse') ? { kind: 'json', message } : { kind: 'request', message };
}

/**
 * One run of the path the app uses: the `conjugateVerb` task, then `verifyAnswer` as the Conjugation page applies
 * it. The execution is wrapped only to keep the answer for a failed run.
 */
export async function runVerb(
  execution: TextExecution,
  verb: string,
  secrets: readonly string[],
): Promise<{ classification: RunClassification; answerPreview: string }> {
  let answerPreview = '';
  const recorded: TextExecution = {
    model: execution.model,
    supportsAudioInput: execution.supportsAudioInput,
    imageInput: execution.imageInput,
    async generateJson<T>(request: JsonRequest): Promise<T> {
      const value = await execution.generateJson<unknown>(request);
      answerPreview = redact(JSON.stringify(value) ?? '', secrets).slice(0, PREVIEW_LENGTH);
      return value as T;
    },
  };
  try {
    const answer = await conjugateVerb({ infinitive: verb }, { execution: recorded, lang: 'en' });
    const classification = classifyAnswer(verifyAnswer(answer));
    return { classification, answerPreview: classification.kind === 'ok' ? '' : answerPreview };
  } catch (error) {
    return { classification: classifyFailure(error, secrets), answerPreview };
  }
}

/**
 * Access for one provider from an in-memory settings snapshot: `appSettings` reads localStorage, so a stand-in
 * exists for the length of the run and nothing reaches the disk.
 */
function accessFor(run: ProviderRun) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  saveAppSettings({
    textProvider: run.id,
    textModel: run.model,
    apiKeys: { [run.id]: run.key },
    ...(run.baseUrl && { baseUrls: { [run.id]: run.baseUrl } }),
  });
  return createByokAccess(getAppSettings());
}

/** Every case, `repeat` times, on one provider's model. */
export async function runProvider(run: ProviderRun, repeat: number): Promise<RunRecord[]> {
  const execution = accessFor(run).text('text');
  const records: RunRecord[] = [];
  for (const verb of CASES) {
    for (let attempt = 0; attempt < repeat; attempt++) {
      const started = performance.now();
      const result = await runVerb(execution, verb, [run.key]);
      records.push({
        provider: run.id,
        model: run.model,
        verb,
        ms: Math.round(performance.now() - started),
        ...result,
      });
    }
  }
  return records;
}

const COLUMNS = ['provider', 'model', 'verb', 'runs', 'ok', 'request', 'json', 'schema', 'engine'] as const;

/** Provider, model and verb with the run count and one column per failure kind. */
export function formatTable(records: readonly RunRecord[]): string {
  const groups = new Map<string, RunRecord[]>();
  for (const record of records) {
    const key = [record.provider, record.model, record.verb].join('\u0000');
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const rows = [...groups.values()].map((group) => {
    const count = (kind: RunClassification['kind']) =>
      group.filter(({ classification }) => classification.kind === kind).length;
    const first = group[0];
    return [
      first.provider,
      first.model,
      first.verb,
      String(group.length),
      String(count('ok')),
      String(count('request')),
      String(count('json')),
      String(count('schema')),
      String(count('engine')),
    ];
  });
  const widths = COLUMNS.map((column, index) => Math.max(column.length, ...rows.map((row) => row[index].length)));
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join('  ')
      .trimEnd();
  return [line(COLUMNS), ...rows.map(line)].join('\n');
}

/** What `--dry-run` prints: the cases, what would call (model and endpoint, never a key) and what would not. */
export function describePlan(plan: Plan, repeat: number): string {
  return [
    `Cases (${CASES.length}): ${CASES.join(', ')}`,
    `Repeat: ${repeat}`,
    plan.runs.length ? 'Would run:' : 'Would run: nothing',
    ...plan.runs.map((run) => `  ${run.id}  model ${run.model}${run.baseUrl ? `  base URL ${run.baseUrl}` : ''}`),
    plan.skipped.length ? 'Skipped:' : 'Skipped: nothing',
    ...plan.skipped.map(({ id, reason }) => `  ${id}: ${reason}`),
  ].join('\n');
}

/** `.local/conjugate-check/<UTC timestamp>.json`: every run's classification and the failure previews. */
export async function writeReport(records: readonly RunRecord[], directory: string, now = new Date()): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${now.toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
  const body = { ranAt: now.toISOString(), cases: CASES, runs: records };
  await Bun.write(path, JSON.stringify(body, null, 2) + '\n');
  return path;
}

export interface Options {
  providers: string[];
  repeat: number;
  dryRun: boolean;
  help: boolean;
}

export function parseArgs(args: readonly string[]): Options {
  const options: Options = { providers: [], repeat: DEFAULT_REPEAT, dryRun: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--providers' || arg === '--repeat') {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a value`);
      index++;
      if (arg === '--providers')
        options.providers = value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
      else {
        const repeat = Number(value);
        if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat needs a whole number from 1');
        options.repeat = repeat;
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const USAGE = `Real-provider check of the conjugation prompt (#21): one run of the app's own path per case.

  RELIRE_KEY_OPENAI=... bun scripts/grammar-pack/check-conjugate-providers.ts --providers openai --repeat 3

Keys come only from RELIRE_KEY_<PROVIDER_ID> (upper-cased, '-' as '_'); a provider without one is skipped.
The model comes from RELIRE_MODEL_<PROVIDER_ID>, else the provider's catalogue default; the endpoint from
RELIRE_BASEURL_<PROVIDER_ID>. Type a key into the shell, never into a chat, a file or a commit.

  --providers a,b  providers to check (default: every registered text provider that needs a key)
  --repeat N       runs per case and provider (default ${DEFAULT_REPEAT})
  --dry-run        print what would run, with its model and endpoint; no request and no file
  --help           this text`;

async function main(args: readonly string[]) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const plan = planProviders(process.env, options.providers);
  if (options.dryRun) {
    console.log(describePlan(plan, options.repeat));
    return;
  }
  const records: RunRecord[] = [];
  for (const run of plan.runs) records.push(...(await runProvider(run, options.repeat)));
  for (const { id, reason } of plan.skipped) console.log(`skipped: ${id}: ${reason}`);
  console.log(records.length ? formatTable(records) : 'No provider was configured; nothing ran.');
  const path = await writeReport(
    records,
    resolve(fileURLToPath(new URL('../../', import.meta.url)), '.local/conjugate-check'),
  );
  console.log(`Report: ${path}`);
}

if (import.meta.main) await main(Bun.argv.slice(2));
