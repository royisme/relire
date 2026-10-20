/** Server-rendered TEST-only control privacy and authored feedback; browser geometry/focus still need e2e. */
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { learningFixture } from './fixtures/grammarLearning';
import { topicExerciseRevision, topicToExerciseUnit } from '../src/services/grammarTopics/checkpoints';
import { TopicFeedbackSheet } from '../src/components/practice/TopicFeedbackSheet';
import { ChoiceSelectControl } from '../src/components/practice/controls/ChoiceSelectControl';
import { FillBlanksControl } from '../src/components/practice/controls/FillBlanksControl';
import { emptyAnswer } from '../src/services/exercises/answer';
import type { ReactNode } from 'react';

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
const render = (node: ReactNode) => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
async function fixture() {
  const topic = learningFixture();
  return topicToExerciseUnit(topic, await topicExerciseRevision(topic), 123);
}

test('unchecked controls expose available choices but never indicate the key or render authored feedback/accepted variants', async () => {
  const unit = await fixture();
  for (const [index, Control] of [
    [0, ChoiceSelectControl],
    [1, FillBlanksControl],
  ] as const) {
    const item = unit.items[index];
    const html = render(
      <Control
        item={item}
        type={item.type!}
        answer={emptyAnswer(item)}
        onChange={() => {}}
        checked={null}
        disabled={false}
        registerInput={() => {}}
        correctionPlacement="feedback"
      />,
    );
    expect(html).not.toContain('select-all');
    expect(html).not.toContain('reader-word');
    expect(html).not.toContain('aria-pressed="true"');
    for (const hidden of ['TEST correct', 'TEST incorrect', 'TEST winter distractor', 'TEST typed fallback', 'collège'])
      expect(html).not.toContain(hidden);
    if (index === 0) expect(html).toContain('été');
    else expect(html).not.toContain('école');
  }
});

test('both pilot controls put wrong corrections in feedback only when requested; worksheets keep inline corrections', async () => {
  const unit = await fixture();
  for (const [index, Control] of [
    [0, ChoiceSelectControl],
    [1, FillBlanksControl],
  ] as const) {
    const item = unit.items[index];
    const props = {
      item,
      type: item.type!,
      answer: emptyAnswer(item),
      onChange() {},
      checked: { correct: false, strictAccents: true },
      disabled: true,
      registerInput() {},
    };
    expect(render(<Control {...props} />)).toContain('select-all');
    expect(render(<Control {...props} correctionPlacement="feedback" />)).not.toContain('select-all');
  }
});

test('self-contained authored feedback is bilingual plain text and errors remain readable without leaking a key', async () => {
  const unit = await fixture();
  const question = unit.items[0].topicQuestion!;
  const feedback = question.feedback.byAnswer![0].message;
  for (const language of ['en', 'zh'] as const) {
    await i18n.changeLanguage(language);
    const html = render(
      <TopicFeedbackSheet
        instruction={question.instruction}
        prompt={unit.items[0].prompt}
        feedback={feedback}
        onClose={() => {}}
      />,
    );
    expect(html).toContain(feedback.summary[language]);
    expect(html).toContain(feedback.detail![language]);
    expect(html).not.toContain('reader-word');
    expect(html).not.toContain('<input');
    const error = render(<TopicFeedbackSheet error="TEST storage <denied>" onClose={() => {}} />);
    expect(error).toContain('TEST storage &lt;denied&gt;');
    expect(error).not.toContain('TEST winter distractor');
  }
  await i18n.changeLanguage('en');
});
