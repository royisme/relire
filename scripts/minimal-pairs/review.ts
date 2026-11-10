/**
 * Owns the owner's plain-text review sheet and append-only review recording for
 * pair rows; not the publish gate or pack assembly (build.ts).
 */
import { readInputs, ReviewsSchema, rowHash } from './build';
import type { Pair } from '../../src/types/minimalPairs';

function pairTable(pair: Pair): string {
  return [
    `${pair.id} (${pair.contrast})`,
    `  words\t${pair.a} / ${pair.b}`,
    ...(pair.note === undefined ? [] : [`  note\t${pair.note}`]),
  ].join('\n');
}

if (import.meta.main) {
  const [command, ...args] = Bun.argv.slice(2);
  const by = args.indexOf('--by');
  const ref = args.indexOf('--ref');
  const ids = args.slice(0, by === -1 ? args.length : by);
  if (
    !ids.length ||
    ids.some((id) => id.startsWith('--')) ||
    (command !== 'print' && command !== 'record') ||
    (command === 'print' && (by !== -1 || ref !== -1)) ||
    (command === 'record' && (by < 1 || ref !== by + 2 || args.length !== ref + 2))
  ) {
    throw new Error('Usage: review.ts print <id...> | record <id...> --by "<name>" --ref "<reference>"');
  }
  const { source, reviews } = await readInputs();
  const unknown = ids.filter((id) => !source.pairs.some((pair) => pair.id === id));
  if (unknown.length) throw new Error(unknown.map((id) => `${id}: unknown id`).join('\n'));
  const targets = source.pairs.filter((pair) => ids.includes(pair.id));
  if (command === 'print') {
    console.log(targets.map(pairTable).join('\n\n'));
  } else {
    const reviewedAt = new Date().toISOString().slice(0, 10);
    const records = targets.map((pair) => ({
      pairId: pair.id,
      rowHash: rowHash(pair),
      reviewedBy: args[by + 1]!,
      reviewedAt,
      reference: args[ref + 1]!,
    }));
    const next = ReviewsSchema.parse({ records: [...reviews.records, ...records] });
    await Bun.write(
      new URL('../../data/minimal-pairs/reviews.json', import.meta.url),
      JSON.stringify(next, null, 2) + '\n',
    );
  }
}
