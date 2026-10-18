import { expect, test } from 'bun:test';
import { GrammarPackSchema, ProvenanceSchema, type GrammarPack, type Verb } from '../src/types/grammarPack';
import { GOLDEN } from './fixtures/grammarPackGolden';
import { generate } from './fixtures/grammarPackVerbs';

const prov: Verb['prov'] = {
  origin: 'rule',
  checkedAgainst: ['consistency'],
  checkedAt: '2026-10-18',
  status: 'auto-checked',
};
const pack = (): GrammarPack => ({
  schemaVersion: 1,
  packVersion: '0.1.0',
  verbs: Object.values(structuredClone(GOLDEN)).map((verb) => ({ ...verb, prov })),
});
const bad = (change: (p: GrammarPack) => void, message: string) => {
  const p = pack();
  change(p);
  const result = GrammarPackSchema.safeParse(p);
  expect(result.success).toBe(false);
  expect(result.error?.issues.map((issue) => issue.message).join('\n')).toContain(message);
};

test('a valid pack passes (the golden controls, hand-typed)', () => {
  expect(GrammarPackSchema.safeParse(pack()).success).toBe(true);
});

test('a draft row from the generator is not shippable', () => {
  const draft = {
    schemaVersion: 1,
    packVersion: '0.1.0',
    verbs: [generate({ id: 'aller', infinitive: 'aller', rule: 'irregular', aux: 'etre' }).verb],
  };
  const result = GrammarPackSchema.safeParse(draft);
  expect(result.success).toBe(false);
  expect(result.error?.issues[0].message).toContain('aller has status draft');
});

test('duplicate ids are rejected', () => {
  bad((p) => p.verbs.push(structuredClone(p.verbs[0])), 'duplicate id etre');
});

test('draft and rejected status are rejected, auto-checked and reviewed pass', () => {
  bad((p) => (p.verbs[0].prov = { origin: 'rule', checkedAgainst: [], status: 'draft' }), 'has status draft');
  bad((p) => (p.verbs[0].prov = { ...prov, status: 'rejected' }), 'has status rejected');
  const p = pack();
  p.verbs[0].prov = { ...prov, status: 'reviewed', reviewedBy: 'A. Reviewer' };
  expect(GrammarPackSchema.safeParse(p).success).toBe(true);
});

test('provenance needs checkedAt unless draft, and reviewedBy when reviewed', () => {
  expect(ProvenanceSchema.safeParse({ origin: 'rule', checkedAgainst: [], status: 'draft' }).success).toBe(true);
  expect(
    ProvenanceSchema.safeParse({ origin: 'rule', checkedAgainst: [], status: 'auto-checked' }).error?.issues[0].message,
  ).toContain('checkedAt');
  expect(ProvenanceSchema.safeParse({ ...prov, status: 'reviewed' }).error?.issues[0].message).toContain('reviewedBy');
});

test('a missing person is rejected', () => {
  bad((p) => delete p.verbs[0].tenses.present['2sg'], 'cell is missing');
  bad((p) => delete p.verbs[0].tenses.imperatif!['1pl'], 'cell is missing');
});

test('a missing imperatif or present participle is rejected on a non-defective verb', () => {
  bad((p) => delete p.verbs[0].tenses.imperatif, 'imperatif is missing');
  bad((p) => delete p.verbs[0].participles.present, 'present participle is missing');
});

test('imperatif on a defective verb is rejected', () => {
  bad((p) => (p.verbs[0].defective = 'impersonal'), 'a defective verb has no imperatif');
});

test('a defective verb takes only its persons, and may omit the present participle', () => {
  const falloir = generate({
    id: 'falloir',
    infinitive: 'falloir',
    rule: 'irregular',
    aux: 'avoir',
    defective: 'impersonal',
  }).verb;
  const ok = { schemaVersion: 1, packVersion: '0.1.0', verbs: [{ ...falloir, prov }] };
  expect(GrammarPackSchema.safeParse(ok).success).toBe(true);
  const extra = structuredClone(ok);
  extra.verbs[0].tenses.present['2sg'] = { lead: 'tu', forms: ['faux'] };
  expect(GrammarPackSchema.safeParse(extra).error?.issues[0].message).toContain('cell is not allowed');
});

test('lead rules: set on imperatif and empty elsewhere are rejected', () => {
  bad((p) => (p.verbs[0].tenses.imperatif!['2sg']!.lead = 'tu'), 'lead must be empty in imperatif');
  bad((p) => (p.verbs[0].tenses.present['1sg']!.lead = ''), 'lead is empty outside imperatif');
});

test('a pronominal verb must take être', () => {
  bad((p) => (p.verbs[3].aux = 'avoir'), 'a pronominal verb takes être');
});

test('duplicate forms inside a cell are rejected', () => {
  bad((p) => (p.verbs[0].tenses.present['1sg']!.forms = ['suis', 'suis']), 'duplicate form');
});

test('strings must be NFC with the typographic apostrophe', () => {
  bad((p) => (p.verbs[0].tenses.present['1sg']!.lead = "j'"), 'typographic apostrophe');
  bad((p) => (p.verbs[0].tenses.present['2pl']!.forms = ['êtes']), 'not NFC');
});

test('the version fields are checked', () => {
  bad((p) => ((p as { schemaVersion: number }).schemaVersion = 2), 'Invalid input');
  bad((p) => (p.packVersion = '1.0'), 'Invalid string');
  bad((p) => (p.verbs = []), 'Too small');
});
