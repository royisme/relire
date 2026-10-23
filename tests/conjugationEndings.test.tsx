/** Engine splits and their ending reference: no spelling inference, copied tables or split irregulars. */
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '../src/i18n/locales/en.json';
import { CellForm } from '../src/components/study/grammar/CellForm';
import { RuleEndings } from '../src/components/study/grammar/RuleEndings';
import { ruleEndingRows } from '../src/components/study/grammar/forms';
import { generateVerb } from '../src/services/conjugation/generate';
import { composeLead, joinParts } from '../src/services/conjugation/rules';
import { verifyAnswer, verifyPackVerb } from '../src/services/conjugation/verify';
import { REGULAR_RULES } from '../src/services/conjugation/rules';
import { erAnswer, parlerAnswer } from './fixtures/conjugationAnswer';
import { generateControls } from './fixtures/grammarPackVerbs';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } }, initAsync: false });
const renderTable = (verb: Parameters<typeof RuleEndings>[0]['verb']) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <RuleEndings verb={verb} />
    </I18nextProvider>,
  );

const renderCell = (cell: Parameters<typeof CellForm>[0]['cell']) => renderToStaticMarkup(<CellForm cell={cell} />);

test('matching and reviewed regular cells retain the engine split, with lead and clitic outside the ending', () => {
  const verb = verifyAnswer(erAnswer('se laver', 'er-regular', { plain: 'lav', strong: 'lav', fut: 'laver' }));
  const cell = verb.tenses.imperatif['2sg']!;
  expect(cell.parts).toEqual([{ stem: 'lav', ending: 'e', clitic: '-toi' }]);
  expect(renderCell(cell)).toContain(
    'lav<span class="font-semibold underline decoration-ink-500 underline-offset-4">e</span>-toi',
  );
  const pack = verifyPackVerb(generateControls()[3].verb);
  expect(pack.tenses.present['1sg']?.parts).toEqual([{ stem: 'appell', ending: 'e' }]);
  expect(renderCell(pack.tenses.present['1sg']!)).toStartWith('je m’appell<span');
});

test('variants keep their own stems, including a matched non-primary variant order', () => {
  const payer = erAnswer('payer', 'er-yer-i', { plain: 'pay', strong: 'pai', fut: 'paier' });
  payer.forms.present['1sg'] = ['paie', 'paye'];
  const cell = verifyAnswer(payer).tenses.present['1sg']!;
  expect(cell.parts?.map(joinParts)).toEqual(cell.forms);
  expect(cell.parts?.map((part) => part.stem)).toEqual(['pai', 'pay']);
  expect(renderCell(cell).match(/<span/g)).toHaveLength(2);
});

test('differing model forms are unsplit, only the engine line has parts', () => {
  const answer = parlerAnswer();
  answer.forms.present['1sg'] = ['parles'];
  const cell = verifyAnswer(answer).tenses.present['1sg']!;
  expect(cell.parts).toBeUndefined();
  expect(cell.ruleParts).toEqual([{ stem: 'parl', ending: 'e' }]);
  expect(cell.ruleParts?.map(joinParts)).toEqual(cell.ruleForms);
  expect(renderCell(cell)).toBe('je parles');
  expect(ruleEndingRows(verifyAnswer(answer))[0].endings['1sg']).toBe('e');
});

test('the highlighted rule line uses its own elision, not the model lead', () => {
  const answer = parlerAnswer();
  answer.forms.present['1sg'] = ['aime'];
  const verb = verifyAnswer(answer);
  const cell = verb.tenses.present['1sg']!;
  expect(renderCell(cell)).toBe('j’aime');
  const html = renderCell({
    lead: composeLead('present', '1sg', verb, cell.ruleForms![0]),
    forms: cell.ruleForms!,
    parts: cell.ruleParts,
  });
  expect(html).toContain('je parl<span');
});

test('irregular, misfit, unchecked and compound cells never get inferred splits', () => {
  const irregular = verifyPackVerb(generateControls()[1].verb);
  for (const cells of Object.values(irregular.tenses))
    for (const cell of Object.values(cells)) expect(renderCell(cell)).not.toContain('<span');
  expect(ruleEndingRows(irregular)).toEqual([]);
  expect(renderTable(irregular)).toBe('');
  const misfit = verifyAnswer({ ...parlerAnswer(), rule: 'er-cer' });
  expect(ruleEndingRows(misfit)).toEqual([]);
  expect(verifyAnswer(parlerAnswer()).tenses.passeCompose['1sg']?.parts).toBeUndefined();
});

const BASES = {
  'er-regular': 'parl',
  'er-cer': 'commenc',
  'er-ger': 'mang',
  'er-yer-i': 'pay',
  'er-e-grave': 'lev',
  'er-eacute-egrave': 'préfér',
  'er-eler-double': 'appel',
  'ir-issons': 'fin',
  'ir-sortir': 'sort',
  'ir-ouvrir': 'ouvr',
  're-regular': 'vend',
} as const;

for (const rule of Object.keys(REGULAR_RULES) as (keyof typeof BASES)[]) {
  test(`${rule}: the rendered reference and every ending come from generated parts`, () => {
    const base = BASES[rule];
    const infinitive = base + (rule.startsWith('er-') ? 'er' : rule.startsWith('ir-') ? 'ir' : 're');
    const generated = generateVerb(
      { id: infinitive, infinitive, base, rule, aux: 'avoir' },
      rule === 'ir-ouvrir' ? { [infinitive]: { participles: { past: 'ouvert' } } } : {},
    );
    const verb = verifyPackVerb(generated.verb);
    const rows = ruleEndingRows(verb);
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      for (const [person, parts] of Object.entries(generated.parts.simple[row.tense])) {
        expect(row.endings[person as keyof typeof row.endings]).toBe(parts[0].ending);
        expect(verb.tenses[row.tense][person as keyof typeof row.endings]?.parts?.map(joinParts)).toEqual(
          parts.map(joinParts),
        );
      }
    }
    const html = renderTable(verb);
    expect(html).toContain('data-slot="table"');
    expect(html).toContain('scope="col"');
    expect(rows.find((row) => row.tense === 'imperatif')?.endings['1sg']).toBeUndefined();
  });
}

test('an empty ending stays empty, not a made-up suffix', () => {
  const generated = generateVerb(
    { id: 'vendre', infinitive: 'vendre', base: 'vend', rule: 're-regular', aux: 'avoir' },
    {},
  );
  const verb = verifyPackVerb(generated.verb);
  expect(ruleEndingRows(verb)[0].endings['3sg']).toBe('');
  expect(verb.tenses.present['3sg']?.parts).toEqual([{ stem: 'vend', ending: '' }]);
});
