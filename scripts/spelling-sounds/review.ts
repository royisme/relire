/** Owner/lead only by convention: workers must never call record; owns review sheets/records, not approval or assembly. */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { SpellingSoundsReviewsSchema } from '../../src/types/spellingSounds';
import { readInputs, rowHash, type PatternNotes } from './build';

const usage = 'Usage: review.ts print [id...] | record <id...> --by "<name>" --kind ai|human --ref "<reference>"';

export async function review(
  args: string[],
  root = fileURLToPath(new URL('../../', import.meta.url)),
  notes?: PatternNotes,
): Promise<string> {
  const [command, ...rest] = args;
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      strict: true,
      options: {
        by: { type: 'string' },
        kind: { type: 'string' },
        ref: { type: 'string' },
      },
    });
  } catch {
    throw new Error(usage);
  }
  const { values, positionals } = parsed;
  const ids = [...new Set(positionals)];
  if (
    !['print', 'record'].includes(command) ||
    (command === 'print' && Object.keys(values).length > 0) ||
    (command === 'record' &&
      (!ids.length || !values.by?.trim() || !values.ref?.trim() || !['ai', 'human'].includes(values.kind ?? '')))
  )
    throw new Error(usage);
  const { source, reviews, notes: currentNotes } = await readInputs(root, notes);
  const unknown = ids.filter((id) => !source.patterns.some((row) => row.id === id));
  if (unknown.length) throw new Error(`${unknown.map((id) => `${id}: unknown id`).join('\n')}\n${usage}`);
  const targets = source.patterns.filter((row) => !ids.length || ids.includes(row.id));
  if (command === 'print') {
    return targets
      .map((row) => {
        const latest = [...reviews.records].reverse().find((record) => record.id === row.id);
        const state = !latest
          ? 'no review'
          : `${latest.kind}: ${latest.reviewedBy} (${latest.reviewedAt}); ${latest.rowHash === rowHash(row, currentNotes) ? 'current' : 'lapsed'}`;
        return [
          row.id,
          `  spelling\t${row.spelling}`,
          `  group\t${row.group}`,
          `  sound\t${row.sound.join(' / ') || '(silent)'}`,
          `  examples\t${row.examples.join(', ')}`,
          `  en\t${currentNotes.en[row.id] ?? '(missing)'}`,
          `  zh\t${currentNotes.zh[row.id] ?? '(missing)'}`,
          `  review\t${state}`,
        ].join('\n');
      })
      .join('\n\n');
  }
  const reviewedAt = new Date().toISOString().slice(0, 10);
  const records = targets.map((row) => ({
    id: row.id,
    rowHash: rowHash(row, currentNotes),
    kind: values.kind,
    reviewedBy: `${values.kind === 'ai' ? 'AI' : 'Human'} review: ${values.by!.trim()}`,
    reviewedAt,
    reference: values.ref!.trim(),
  }));
  const next = SpellingSoundsReviewsSchema.parse({ records: [...reviews.records, ...records] });
  await Bun.write(join(root, 'data/spelling-sounds/reviews.json'), JSON.stringify(next, null, 2) + '\n');
  return '';
}
if (import.meta.main) {
  const sheet = await review(Bun.argv.slice(2));
  if (sheet) console.log(sheet);
}
