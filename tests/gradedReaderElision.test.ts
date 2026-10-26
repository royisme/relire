/** Invented TEST elision coverage for the lexical gates; no private drafts or language approval. */
import { expect, test } from 'bun:test';
import { checkDraft } from '../scripts/graded-readers/gates';
import type { GateContext } from '../scripts/graded-readers/gateInputs';
import type { ReaderDraft } from '../scripts/graded-readers/drafts';
import {
  bothForms,
  elisionFixture,
  expandedForms,
  siElisionFixture,
  surfaceForms,
} from './fixtures/gradedReaderElision';

const reasons = (draft: ReaderDraft, context: GateContext, gate?: string) =>
  checkDraft(draft, context)
    .filter((diagnostic) => !gate || diagnostic.gate === gate)
    .map((diagnostic) => diagnostic.reason);

test('case 1 G2/G3 TEST elided C’est/J’ai/c’/l’ glossed by the surface pass', () => {
  const { draft, context } = elisionFixture(surfaceForms);
  expect(checkDraft(draft, context)).toEqual([]);
});
test('case 2 G2/G3 TEST elided C’est/J’ai/c’/l’ glossed by the expansion pass', () => {
  const { draft, context } = elisionFixture(expandedForms);
  expect(checkDraft(draft, context)).toEqual([]);
});
test('case 3 G3 TEST an entry listing both the surface and the expansion stays fully encountered', () => {
  const { draft, context } = elisionFixture(bothForms);
  expect(checkDraft(draft, context)).toEqual([]);
});
test('case 3 G3 TEST l’ listing both expansions flags only the never-occurring form', () => {
  const { draft, context } = elisionFixture();
  expect(checkDraft(draft, context)).toEqual([]);
  draft.body.glossary.find((entry) => entry.id === 'le-function')!.forms = ['le', 'la'];
  expect(reasons(draft, context, 'G3')).toEqual(['Gloss form was not encountered: le-function/la']);
});
test('case 4 G2 TEST l’ cannot select an entry that is not le or la', () => {
  const { draft, context } = elisionFixture();
  expect(checkDraft(draft, context)).toEqual([]);
  draft.body.glossary.find((entry) => entry.id === 'le-function')!.lemma = 'les';
  expect(reasons(draft, context, 'G2').some((reason) => reason.includes('not an allowed expansion'))).toBe(true);
});
test('case 5 G2 TEST a glossary form that is neither the surface nor the expansion fails', () => {
  const { draft, context } = elisionFixture();
  expect(checkDraft(draft, context)).toEqual([]);
  draft.body.glossary.find((entry) => entry.id === 'ce-function')!.forms = ['cette'];
  expect(reasons(draft, context, 'G2').some((reason) => reason.includes('not an allowed expansion'))).toBe(true);
});
test('case 6 G2/G5 TEST s’il with the si reading passes and with se fails', () => {
  const { draft, context } = siElisionFixture();
  expect(checkDraft(draft, context)).toEqual([]);
  const si = draft.body.glossary.find((entry) => entry.id === 'si-condition')!;
  si.lemma = 'se';
  si.forms = ['s’'];
  expect(reasons(draft, context, 'G2').some((reason) => reason.includes('not an allowed expansion'))).toBe(true);
});
