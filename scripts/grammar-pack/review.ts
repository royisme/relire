/** Owns the owner's plain-text review sheet and append-only review recording; not generation or the publish gate. */
import { FINITE_PERSONS, TENSES, type Verb } from '../../src/types/grammarPack';
import { cellAt } from './checks';
import { generateRows, readInputs } from './build';
import { ReviewsSchema, rowHash } from './gate';

function table(verb: Verb): string {
  const lines = [`${verb.id} (${verb.infinitive})`, ['tense', ...FINITE_PERSONS].join('\t')];
  for (const tense of TENSES) {
    lines.push(
      [
        tense,
        ...FINITE_PERSONS.map((person) => {
          const cell = cellAt(verb, tense, person);
          if (!cell) return '-';
          const separator = cell.lead && !cell.lead.endsWith('’') ? ' ' : '';
          return cell.lead + separator + cell.forms.join(' / ');
        }),
      ].join('\t'),
    );
  }
  lines.push(`participles\t${verb.participles.present ?? '-'}\t${Object.values(verb.participles.past).join(' / ')}`);
  return lines.join('\n');
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
    throw new Error('Usage: review.ts print <verbId...> | record <verbId...> --by "<name>" --ref "<reference>"');
  }
  const { source, irregulars, reviews } = await readInputs();
  const { generated, failures } = generateRows(source, irregulars);
  const unknown = ids.filter((id) => !generated.some(({ verb }) => verb.id === id));
  failures.push(...unknown.map((id) => `${id}: unknown verb`));
  if (failures.length) throw new Error(failures.join('\n'));
  const verbs = [...new Set(ids)].map((id) => generated.find(({ verb }) => verb.id === id)!.verb);
  if (command === 'print') {
    console.log(verbs.map(table).join('\n\n'));
  } else {
    const reviewedAt = new Date().toISOString().slice(0, 10);
    const next = ReviewsSchema.parse({
      ...reviews,
      records: [
        ...reviews.records,
        ...verbs.map((verb) => ({
          verbId: verb.id,
          rowHash: rowHash(verb),
          reviewedBy: args[by + 1],
          reviewedAt,
          reference: args[ref + 1],
        })),
      ],
    });
    await Bun.write(
      new URL('../../data/grammar-pack/reviews.json', import.meta.url),
      JSON.stringify(next, null, 2) + '\n',
    );
  }
}
