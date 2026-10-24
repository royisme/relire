/** Static TEST-only checkpoint contracts: no browser, storage, geometry or real-provider acceptance. */
import { expect, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { emptyAnswer } from '../src/services/exercises/answer';
import { ReaderCheckpoints, type ReaderQuestionAnswer } from '../src/components/graded/ReaderCheckpoints';
import { gradedReaderFixture } from './fixtures/gradedReaders';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });

const learning = gradedReaderFixture().learning;
const recognition = learning.checkpoints[0]!.questions[0]!;
const typed = learning.checkpoints[0]!.questions[1]!;
const label = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const choice = (value: string): ReaderQuestionAnswer => ({
  answer: { ...emptyAnswer({ prompt: recognition.question.prompt, options: undefined }), choiceSelections: [value] },
  checked: null,
});
const checked = (answer: ReaderQuestionAnswer, correct: boolean): ReaderQuestionAnswer => ({
  ...answer,
  checked: { correct, strictAccents: true },
});

const render = (
  answers: Partial<Record<string, ReaderQuestionAnswer>>,
  pending: string | null = null,
  error?: string,
) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ReaderCheckpoints
        learning={learning}
        answers={answers}
        onChange={() => undefined}
        onCheck={() => undefined}
        onRedo={() => undefined}
        pending={pending}
        error={error}
      />
    </I18nextProvider>,
  );

const button = (html: string, name: string) =>
  html
    .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!
    .find((entry) => entry.includes(`>${name}<`) || entry.includes(`>${name} `))!;

for (const language of ['en', 'zh'] as const) {
  test(`${language}: the instruction and the quoted sentence make the question answerable`, async () => {
    await i18n.changeLanguage(language);
    const html = render({});
    expect(html).toContain(recognition.question.instruction[language]);
    expect(html).toContain(recognition.evidence.quote);
    expect(html).toContain(recognition.question.prompt.split('{')[0]!);
    expect(html).toContain(label('gradedReader.checkpoints.quotedSentence'));
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain(typed.question.prompt);
  });

  test(`${language}: an unanswered question keeps Check disabled and the reserved result slot empty`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ [recognition.question.id]: choice('') });
    expect(button(html, label('grammarTopics.learning.actions.check'))).toContain('disabled=""');
    expect(html).toContain('flex h-32 min-w-0 flex-col');
    expect(html).not.toContain(label('grammarTopics.learning.result.right'));
    expect(html).not.toContain(label('grammarTopics.learning.result.wrong'));
    expect(html).not.toContain(label('grammarTopics.learning.result.readFeedback'));
    expect(button(html, label('grammarTopics.learning.actions.redo'))).toContain('disabled=""');
  });

  test(`${language}: a filled answer enables Check, and the evidence sits beside the question`, async () => {
    await i18n.changeLanguage(language);
    const check = button(
      render({ [recognition.question.id]: choice('un livre') }),
      label('grammarTopics.learning.actions.check'),
    );
    expect(check).not.toContain('disabled=""');
    expect(check).not.toContain('aria-busy="true"');
    // The evidence of the visible question is what makes its instruction answerable.
    const html = render({});
    expect(html).toContain(recognition.evidence.quote);
    expect(html).toContain(label('gradedReader.checkpoints.quotedSentence'));
    expect(html).toContain(recognition.question.instruction[language]);
  });

  test(`${language}: a committed right verdict shows the authored summary in the reserved slot`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ [recognition.question.id]: checked(choice('un livre'), true) });
    expect(html).toContain(label('grammarTopics.learning.result.right'));
    expect(html).toContain(recognition.question.feedback.correct.summary[language]);
    expect(html).not.toContain(label('grammarTopics.learning.result.wrong'));
    expect(html).toContain(label('grammarTopics.learning.result.readFeedback'));
    expect(html).toContain(label('practice.expected'));
    expect(html).toContain('un livre');
    // A checked question cannot be re-checked or edited until it is redone.
    expect(button(html, label('grammarTopics.learning.actions.check'))).toContain('disabled=""');
    expect(button(html, label('grammarTopics.learning.actions.redo'))).not.toContain('disabled=""');
  });

  test(`${language}: a committed wrong verdict shows the reference answer, the authored summary and the struck pick`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ [recognition.question.id]: checked(choice('le livre'), false) });
    expect(html).toContain(label('grammarTopics.learning.result.wrong'));
    expect(html).toContain(recognition.question.feedback.byAnswer![0]!.message.summary[language]);
    expect(html).toContain(label('practice.expected'));
    expect(html).toContain('un livre');
    // The wrong pick is struck through, so the verdict never rests on colour alone.
    expect(html).toContain('line-through');
    expect(html).not.toContain(recognition.question.feedback.incorrect.summary[language]);
  });

  test(`${language}: a pending question keeps its check busy and its answer visible`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ [recognition.question.id]: choice('un livre') }, recognition.question.id);
    expect(button(html, label('grammarTopics.learning.actions.check'))).toContain('aria-busy="true"');
    expect(button(html, label('grammarTopics.learning.actions.check'))).toContain('disabled=""');
    expect(html).toContain('animate-spin');
    expect(html).toContain('un livre');
  });

  test(`${language}: a real check failure shows in the reserved slot and opens the details sheet`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ [recognition.question.id]: choice('un livre') }, null, 'TEST storage denied');
    expect(html).toContain('TEST storage denied');
    expect(html).toContain(label('grammarTopics.learning.result.readDetails'));
    expect(html).not.toContain(label('grammarTopics.learning.result.readFeedback'));
    expect(html).not.toContain(recognition.question.feedback.correct.summary[language]);
  });

  test(`${language}: navigation is explicit, so no question advances by itself`, async () => {
    await i18n.changeLanguage(language);
    const html = render({ [recognition.question.id]: checked(choice('un livre'), true) });
    // One question is visible at a time: the other question's prompt is not rendered.
    expect(html).not.toContain(typed.question.prompt);
    expect(html).not.toContain(label('grammarTopics.learning.actions.next'));
    // Both questions stay reachable through the index, labelled with their verdict.
    expect(html).toContain(label('grammarTopics.learning.index.number', { number: 1 }));
    expect(html).toContain(label('grammarTopics.learning.index.number', { number: 2 }));
    expect(html).toContain(
      label('grammarTopics.learning.index.item', {
        checkpoint: learning.checkpoints[0]!.title[language],
        number: 1,
        total: 2,
        state: label('grammarTopics.learning.index.right'),
      }),
    );
  });
}
await i18n.changeLanguage('en');
