/**
 * Owns the owner's plain-text review sheet and append-only review recording for
 * noun and rule rows; not the measurement (measure.ts), the publish gate or
 * provenance derivation (build.ts).
 */
import { deriveRules, readInputs, ReviewsSchema, rowHash, type RuleRow } from './build';

function ruleTable(row: RuleRow): string {
  return [
    `${row.id} (-${row.ending} → ${row.gender})`,
    `  dictionary\t${row.dictionary.agree}/${row.dictionary.n}`,
    `  a1\t${row.a1.agree}/${row.a1.n}`,
    `  examples\t${row.examples.join(' ') || '-'}`,
    `  exceptions\t${row.exceptions.join(' ') || '-'}`,
  ].join('\n');
}

type NounRef = { id: string; lemma: string; gender: string };
export type ReviewTarget = { noun: NounRef } | { row: RuleRow } | { text: string };

/**
 * What each id names. An id can name a noun, a rule, or both: an ending is spelled like a word (`age` the rule and
 * `âge` the noun, `eau` the rule and the noun), and confirming that id confirms both. An id that names neither
 * (a held, dropped or rejected row) is its reason, which `record` refuses.
 */
export function resolveIds(ids: string[], kept: NounRef[], rows: RuleRow[], drops: string[]): ReviewTarget[] {
  return [...new Set(ids)].flatMap((id): ReviewTarget[] => {
    const noun = kept.find((noun) => noun.id === id);
    const row = rows.find((row) => row.id === id);
    if (noun || row) return [...(noun ? [{ noun }] : []), ...(row ? [{ row }] : [])];
    return [{ text: drops.find((drop) => drop.startsWith(`${id}:`)) ?? `${id}: rejected; skipped` }];
  });
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
  const { source, candidates, reviews, attest } = await readInputs();
  const unknown = ids.filter(
    (id) => !source.nouns.some((noun) => noun.id === id) && !candidates.some((c) => c.id === id),
  );
  if (unknown.length) throw new Error(unknown.map((id) => `${id}: unknown id`).join('\n'));
  const kept = source.nouns.filter((noun) => !reviews.rejected.includes(noun.id));
  const { rows, drops } = deriveRules(
    kept.map(({ id, lemma, gender }) => ({ id, lemma, gender })),
    candidates,
    attest,
  );
  const targets = resolveIds(ids, kept, rows, drops);
  if (command === 'print') {
    console.log(
      targets
        .map((target) =>
          'noun' in target
            ? `${target.noun.id}\t${target.noun.lemma}\t${target.noun.gender}`
            : 'row' in target
              ? ruleTable(target.row)
              : target.text,
        )
        .join('\n\n'),
    );
  } else {
    const reviewedAt = new Date().toISOString().slice(0, 10);
    const records = targets.map((target) => {
      if ('text' in target) throw new Error(target.text);
      return 'noun' in target
        ? {
            nounId: target.noun.id,
            rowHash: rowHash({ id: target.noun.id, lemma: target.noun.lemma, gender: target.noun.gender }),
            reviewedBy: args[by + 1]!,
            reviewedAt,
            reference: args[ref + 1]!,
          }
        : {
            ruleId: target.row.id,
            rowHash: rowHash(target.row),
            reviewedBy: args[by + 1]!,
            reviewedAt,
            reference: args[ref + 1]!,
          };
    });
    const next = ReviewsSchema.parse({ ...reviews, records: [...reviews.records, ...records] });
    await Bun.write(
      new URL('../../data/noun-gender/reviews.json', import.meta.url),
      JSON.stringify(next, null, 2) + '\n',
    );
  }
}
