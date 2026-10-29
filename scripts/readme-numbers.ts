import { readdirSync } from 'node:fs';
import { SAMPLE_ARTICLES } from '../src/data/sampleArticles';
import { ExerciseTypeSchema } from '../src/types/exercises';
import type { NounGenderPack } from '../src/types/nounGender';

const starter = await Bun.file('src/data/graded-readers/starter.json').json();
const grammarPack = await Bun.file('src/data/grammar-pack/pack.json').json();
const nounGender = (await Bun.file('src/data/noun-gender/pack.json').json()) as NounGenderPack;

const rows = [
  { item: 'Bundled graded readers', value: starter.readers.length, file: 'src/data/graded-readers/starter.json' },
  { item: 'Sample articles', value: SAMPLE_ARTICLES.length, file: 'src/data/sampleArticles.ts' },
  {
    item: 'Reviewed verbs in conjugation pack',
    value: Object.keys(grammarPack.verbs).length,
    file: 'src/data/grammar-pack/pack.json',
  },
  { item: 'Noun-ending tendencies', value: nounGender.rules.length, file: 'src/data/noun-gender/pack.json' },
  ...['tion', 'age', 'ure'].map((id) => {
    const rule = nounGender.rules.find((r) => r.id === id);
    if (!rule) throw new Error(`missing noun-gender rule ${id}`);
    return {
      item: `Noun ending -${rule.ending}, ${rule.gender === 'f' ? 'feminine' : 'masculine'} in the dictionary`,
      value: `${rule.dictionary.agree} of ${rule.dictionary.n}`,
      file: 'src/data/noun-gender/pack.json',
    };
  }),
  {
    item: 'Reviewed nouns in the noun-gender pack',
    value: nounGender.nouns.filter((noun) => noun.prov.status === 'reviewed').length,
    file: 'src/data/noun-gender/pack.json',
  },
  { item: 'Exercise types', value: ExerciseTypeSchema.options.length, file: 'src/types/exercises.ts' },
  {
    item: 'UI languages',
    value: readdirSync('src/i18n/locales').filter((f) => f.endsWith('.json')).length,
    file: 'src/i18n/locales/',
  },
];

for (const row of rows) {
  console.log(`${row.item}: ${row.value} (${row.file})`);
}
