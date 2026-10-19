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
  const sheet = [...new Set(ids)].map((id) => {
    const noun = kept.find((noun) => noun.id === id);
    if (noun) return `${noun.id}\t${noun.lemma}\t${noun.gender}`;
    const row = rows.find((row) => row.id === id);
    if (row) return ruleTable(row);
    return drops.find((drop) => drop.startsWith(`${id}:`)) ?? `${id}: rejected; skipped`;
  });
  if (command === 'print') {
    console.log(sheet.join('\n\n'));
  } else {
    const reviewedAt = new Date().toISOString().slice(0, 10);
    const records = [...new Set(ids)].map((id) => {
      const noun = kept.find((noun) => noun.id === id);
      const row = rows.find((row) => row.id === id);
      if (!noun && !row) throw new Error(`${id}: ${drops.find((drop) => drop.startsWith(`${id}:`)) ?? 'rejected'}`);
      return noun
        ? {
            nounId: noun.id,
            rowHash: rowHash({ id: noun.id, lemma: noun.lemma, gender: noun.gender }),
            reviewedBy: args[by + 1]!,
            reviewedAt,
            reference: args[ref + 1]!,
          }
        : { ruleId: row!.id, rowHash: rowHash(row), reviewedBy: args[by + 1]!, reviewedAt, reference: args[ref + 1]! };
    });
    const next = ReviewsSchema.parse({ ...reviews, records: [...reviews.records, ...records] });
    await Bun.write(
      new URL('../../data/noun-gender/reviews.json', import.meta.url),
      JSON.stringify(next, null, 2) + '\n',
    );
  }
}
