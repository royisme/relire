/** TEST-only sheet completeness and review-state checks; no real private content or reviewers. */
import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { renderSheet, sheet } from '../scripts/graded-readers/sheet';
import { checkDraft } from '../scripts/graded-readers/gates';
import { reviewFixture, reviewTestRoot, testReview } from './fixtures/gradedReaderReview';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function bilingualFields(value: unknown, path = ''): { path: string; text: string }[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    (key === 'en' || key === 'zh') && typeof item === 'string'
      ? [{ path: `${path}.${key}`, text: item }]
      : bilingualFields(item, `${path}.${key}`),
  );
}

test('TEST sheet includes every EN/ZH field, including optional and distractor feedback', () => {
  const { draft, context } = reviewFixture();
  const learning = draft.body.learning;
  learning.instruction.en = 'TEST learning instruction';
  learning.checkpoints[0].title.en = 'TEST checkpoint title';
  const question = learning.checkpoints[0].questions[0].question;
  question.feedback.correct.detail = { en: 'TEST correct detail', zh: '\u6d4b\u8bd5 correct detail' };
  question.feedback.incorrect.detail = { en: 'TEST incorrect detail', zh: '\u6d4b\u8bd5 incorrect detail' };
  question.feedback.byAnswer = [
    {
      answer: 'le livre',
      message: {
        summary: { en: 'TEST distractor summary', zh: '\u6d4b\u8bd5 distractor summary' },
        detail: { en: 'TEST distractor detail', zh: '\u6d4b\u8bd5 distractor detail' },
      },
    },
  ];
  const fields = bilingualFields(draft.body);
  // Distinct markers prevent a repeated translation elsewhere from masking an omitted field.
  for (const { path } of fields) {
    const keys = path.slice(1).split('.');
    let owner: Record<string, unknown> = draft.body as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) owner = owner[key] as Record<string, unknown>;
    const key = keys.at(-1)!;
    owner[key] = `${key === 'zh' ? '\u6d4b\u8bd5 ' : 'TEST '}${path}`;
  }
  const output = renderSheet(draft, context);
  for (const field of bilingualFields(draft.body)) expect(output).toContain(field.text);
  expect(output).toContain('Options recognize-book: ["un livre","le livre"]');
  expect(output).toContain('expectedAnswer');
  expect(output).toContain('sentenceId');
  expect(output).toContain('gender');
  expect(output).toContain('Stage caps and policy');
  expect(output).toContain('Current checkDraft diagnostics');
});

test('TEST sheet shows every authored atom selection, ambiguity candidates, counts and diagnostics', () => {
  const { draft, context } = reviewFixture();
  expect(checkDraft(draft, context)).toEqual([]);
  const output = renderSheet(draft, context);
  for (const analysis of draft.analyses) expect(output).toContain(JSON.stringify(analysis));
  expect(output).toContain('"spelling":"est"');
  expect(output).toContain('"pos":"noun"');
  expect(output).toContain('"lemma":"être"');
  expect(output).toContain('"newEntries":3');
  draft.analyses.pop();
  expect(renderSheet(draft, context)).toContain('exactly one authored analysis');
});

test('TEST sheet labels none/current/lapsed and lapses unchanged later bodies after predecessor edits', () => {
  const { draft, context } = reviewFixture(2);
  expect(renderSheet(draft, context)).toContain('Review: none');
  context.reviews.records.push(testReview(draft));
  expect(renderSheet(draft, context)).toContain('Review: current');
  context.previous[0].body.title.en += ' TEST edit';
  expect(renderSheet(draft, context)).toContain('Review: lapsed');
});

test('TEST sheet CLI stage selection uses only the selected drafts', async () => {
  const fixture = reviewFixture(2);
  const root = await reviewTestRoot(fixture);
  roots.push(root);
  expect(await sheet([], root)).toBe('');
  const load = async () => ({ drafts: fixture.drafts, context: fixture.inputs });
  const output = await sheet(['--stage', '2'], root, load);
  expect(output).toContain(`${fixture.draft.body.id} | stage 2`);
  expect(output).not.toContain(`${fixture.drafts[0].body.id} | stage 1`);
  await rejects(sheet(['--stage', '13'], root, load));
});
