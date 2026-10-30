/**
 * Owner-run check of the `atelier` round prompt against real providers: for every provider the environment
 * configures (`RELIRE_KEY_<ID>`, never printed or written), a few themes at the game's three levels, one run
 * of the app's own path per combination — items returned, dropped items with each reason, how many map onto
 * the stored exercise shape — and the latency; the ignored report lands under `.local/atelier-check/`.
 * Not part of CI.
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createByokAccess } from '../../src/services/ai/access';
import { errorMessage } from '../../src/services/ai/errors';
import { generateAtelierRound } from '../../src/services/ai/tasks';
import { toExerciseItem } from '../../src/services/atelier/toExerciseItem';
import { loadThemes } from '../../src/services/themes/load';
import type { AtelierLevel } from '../../src/types/atelier';
import type { Theme } from '../../src/types/themes';
import type { TextExecution } from '../../src/services/ai/types';
import { getAppSettings, saveAppSettings } from '../../src/utils/appSettings';
import { planProviders, redact, type Plan, type ProviderRun } from '../grammar-pack/check-conjugate-providers';

/** Edit this list to change which themes are asked. */
export const THEMES = ['housing', 'immigration', 'technology'] as const;
export const LEVELS: readonly AtelierLevel[] = ['A2', 'B1', 'B2'];
/** One round is the game's default size. */
const COUNT = 5;

export interface RunRecord {
  provider: string;
  model: string;
  theme: string;
  level: AtelierLevel;
  ms: number;
  items: number;
  dropped: { index: number; reason: string }[];
  /** How many returned items also pass `toExerciseItem`, the shape the round is saved through. */
  mapped: number;
  unmapped: { item: number; reason: string }[];
  /** The run failed before a round existed; the real, redacted message. */
  failure?: string;
}

type RoundOutcome = Omit<RunRecord, 'provider' | 'model' | 'theme' | 'level'>;

/** One theme and level through the app's own path: the task the screen calls, then the stored-item mapping. */
export async function runRound(
  execution: TextExecution,
  theme: Theme,
  level: AtelierLevel,
  secrets: readonly string[],
): Promise<RoundOutcome> {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    const round = await generateAtelierRound({ theme, level, count: COUNT }, { execution, lang: 'en' });
    let mapped = 0;
    const unmapped: { item: number; reason: string }[] = [];
    round.items.forEach((item, index) => {
      try {
        toExerciseItem(item, { id: `check-${index}`, itemNumber: index + 1, themeId: theme.id, level, language: 'en' });
        mapped++;
      } catch (error) {
        unmapped.push({ item: index, reason: redact(error instanceof Error ? error.message : String(error), secrets) });
      }
    });
    return {
      ms: ms(),
      items: round.items.length,
      dropped: round.dropped.map((drop) => ({ ...drop, reason: redact(drop.reason, secrets) })),
      mapped,
      unmapped,
    };
  } catch (error) {
    return { ms: ms(), items: 0, dropped: [], mapped: 0, unmapped: [], failure: redact(errorMessage(error), secrets) };
  }
}

/**
 * Access for one provider from an in-memory settings snapshot: `appSettings` reads localStorage, so a stand-in
 * exists for the length of the run and nothing reaches the disk.
 */
function executionFor(run: ProviderRun): TextExecution {
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
  return createByokAccess(getAppSettings()).text('text');
}

/** Every theme and level, once, on one provider's model. */
export async function runProvider(run: ProviderRun, themes: readonly Theme[]): Promise<RunRecord[]> {
  const execution = executionFor(run);
  const records: RunRecord[] = [];
  for (const theme of themes) {
    for (const level of LEVELS) {
      const outcome = await runRound(execution, theme, level, [run.key]);
      records.push({ provider: run.id, model: run.model, theme: theme.id, level, ...outcome });
    }
  }
  return records;
}

/** One line per run, with each drop reason and mapping failure under it. */
export function describeRun(record: RunRecord): string {
  const counts = record.failure
    ? 'failed'
    : `${record.items} items, ${record.dropped.length} dropped, ${record.mapped} mapped`;
  const lines = [`${record.provider} ${record.model} ${record.theme} ${record.level}: ${counts}, ${record.ms} ms`];
  if (record.failure) lines.push(`  failed: ${record.failure}`);
  for (const drop of record.dropped) lines.push(`  dropped ${drop.index}: ${drop.reason}`);
  for (const item of record.unmapped) lines.push(`  unmapped ${item.item}: ${item.reason}`);
  return lines.join('\n');
}

/** Provider and model with the run count and the totals. */
export function summarize(records: readonly RunRecord[]): string {
  const groups = new Map<string, RunRecord[]>();
  for (const record of records) {
    const key = `${record.provider}\u0000${record.model}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()]
    .map((runs) => {
      const first = runs[0];
      const total = (pick: (run: RunRecord) => number) => runs.reduce((sum, run) => sum + pick(run), 0);
      return (
        `${first.provider} ${first.model}: ${runs.length} runs, ${runs.filter((run) => run.failure).length} failed, ` +
        `${total((run) => run.items)} items, ${total((run) => run.dropped.length)} dropped, ${total((run) => run.mapped)} mapped`
      );
    })
    .join('\n');
}

/** `.local/atelier-check/<UTC timestamp>.json`. */
export async function writeReport(records: readonly RunRecord[], directory: string, now = new Date()): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${now.toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
  const body = { ranAt: now.toISOString(), themes: THEMES, levels: LEVELS, runs: records };
  await Bun.write(path, JSON.stringify(body, null, 2) + '\n');
  return path;
}

/** What `--dry-run` prints: the themes and levels, and what would call (model and endpoint, never a key). */
export function describePlan(plan: Plan, themes: readonly Theme[]): string {
  return [
    `Themes (${themes.length}): ${themes.map((theme) => theme.id).join(', ')}`,
    `Levels: ${LEVELS.join(', ')}, ${COUNT} items each`,
    plan.runs.length ? 'Would run:' : 'Would run: nothing',
    ...plan.runs.map((run) => `  ${run.id}  model ${run.model}${run.baseUrl ? `  base URL ${run.baseUrl}` : ''}`),
    plan.skipped.length ? 'Skipped:' : 'Skipped: nothing',
    ...plan.skipped.map(({ id, reason }) => `  ${id}: ${reason}`),
  ].join('\n');
}

export interface Options {
  providers: string[];
  dryRun: boolean;
  help: boolean;
}

export function parseArgs(args: readonly string[]): Options {
  const options: Options = { providers: [], dryRun: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--providers') {
      const value = args[++index];
      if (!value) throw new Error('--providers needs a value');
      options.providers = value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const USAGE = `Real-provider check of the atelier round prompt: one run of the app's own path per theme and level.

  RELIRE_KEY_OPENAI=... bun scripts/atelier/check-round.ts --providers openai

Keys come only from RELIRE_KEY_<PROVIDER_ID> (upper-cased, '-' as '_'); a provider without one is skipped.
The model comes from RELIRE_MODEL_<PROVIDER_ID>, else the provider's catalogue default; the endpoint from
RELIRE_BASEURL_<PROVIDER_ID>. Type a key into the shell, never into a chat, a file or a commit.

  --providers a,b  providers to check (default: every registered text provider that needs a key)
  --dry-run        print what would run, with its model and endpoint; no request and no file
  --help           this text`;

/** The check's themes from the bundled taxonomy, in `THEMES` order. */
async function checkThemes(): Promise<Theme[]> {
  const taxonomy = await loadThemes();
  const themes: Theme[] = [];
  for (const id of THEMES) {
    const theme = taxonomy.find((candidate) => candidate.id === id);
    if (!theme) throw new Error(`The theme taxonomy has no theme "${id}".`);
    themes.push(theme);
  }
  return themes;
}

async function main(args: readonly string[]) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const plan = planProviders(process.env, options.providers);
  const themes = await checkThemes();
  if (options.dryRun) {
    console.log(describePlan(plan, themes));
    return;
  }
  const records: RunRecord[] = [];
  for (const run of plan.runs) records.push(...(await runProvider(run, themes)));
  for (const { id, reason } of plan.skipped) console.log(`skipped: ${id}: ${reason}`);
  for (const record of records) console.log(describeRun(record));
  console.log(records.length ? summarize(records) : 'No provider was configured; nothing ran.');
  const path = await writeReport(
    records,
    resolve(fileURLToPath(new URL('../../', import.meta.url)), '.local/atelier-check'),
  );
  console.log(`Report: ${path}`);
}

if (import.meta.main) await main(Bun.argv.slice(2));
