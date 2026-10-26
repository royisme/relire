import { SAMPLE_ARTICLES } from '../src/data/sampleArticles';
import { ExerciseTypeSchema } from '../src/types/exercises';

const starter = await Bun.file('src/data/graded-readers/starter.json').json();
const grammarPack = await Bun.file('src/data/grammar-pack/pack.json').json();
const nounGender = await Bun.file('src/data/noun-gender/pack.json').json();

const rows = [
  { item: 'Bundled graded readers', value: starter.readers.length, file: 'src/data/graded-readers/starter.json' },
  { item: 'Sample articles', value: SAMPLE_ARTICLES.length, file: 'src/data/sampleArticles.ts' },
  {
    item: 'Reviewed verbs in conjugation pack',
    value: Object.keys(grammarPack.verbs).length,
    file: 'src/data/grammar-pack/pack.json',
  },
  { item: 'Noun-ending tendencies', value: nounGender.rules.length, file: 'src/data/noun-gender/pack.json' },
  { item: 'Exercise types', value: ExerciseTypeSchema.options.length, file: 'src/types/exercises.ts' },
  { item: 'UI languages', value: 2, file: 'src/i18n/locales/{en,zh}.json' },
];

for (const row of rows) {
  console.log(`${row.item}: ${row.value} (${row.file})`);
}
