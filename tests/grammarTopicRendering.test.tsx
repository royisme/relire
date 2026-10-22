/** Server-rendered TEST-only control privacy and authored feedback; browser geometry/focus still need e2e. */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { learningFixture } from './fixtures/grammarLearning';
import { topicExerciseRevision, topicToExerciseUnit } from '../src/services/grammarTopics/checkpoints';
import { TopicFeedbackSheet } from '../src/components/practice/TopicFeedbackSheet';

import type { ExerciseUnitSession } from '../src/hooks/useExerciseUnit';
import { emptyItems, sheetProgress } from '../src/hooks/exerciseUnit/model';
import { ChoiceSelectControl } from '../src/components/practice/controls/ChoiceSelectControl';
import { FillBlanksControl } from '../src/components/practice/controls/FillBlanksControl';
import { emptyAnswer } from '../src/services/exercises/answer';
import type { ReactNode } from 'react';

// The route module captures browser history at import time; static rendering never navigates.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
const { TopicWorkbench } = await import('../src/components/practice/TopicWorkbench');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');

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

function makeSession(
  unit: Awaited<ReturnType<typeof fixture>>,
  items: ReturnType<typeof emptyItems>,
  saveError: string | null,
): ExerciseUnitSession {
  return {
    status: 'ready',
    loadError: null,
    unit,
    items,
    progress: sheetProgress(unit, items),
    saveError,
    canReset: true,
    resetting: false,
    resetError: null,
    setAnswer() {},
    async check() {},
    async checkAll() {},
    async requestHint() {},
    async requestExplanation() {},
    async reset() {
      return true;
    },
    async resetItem() {},
    retrySave() {},
    reload() {},
  };
}

for (const verdict of ['right', 'wrong', 'unchecked'] as const) {
  test(`${verdict} question keeps its own result and Sheet when another question has a draft save error`, async () => {
    const unit = await fixture();
    const items = emptyItems(unit);
    if (verdict !== 'unchecked') {
      for (const item of unit.items) {
        items[item.id].checked = { correct: verdict === 'right', strictAccents: true };
        items[item.id].answer.choiceSelections = [verdict === 'right' ? 'été' : 'hiver'];
      }
    }
    const session = makeSession(unit, items, 'TEST other question storage denied');
    for (const language of ['en', 'zh'] as const) {
      await i18n.changeLanguage(language);
      // Open the real workbench Sheet in a static render without replacing any of its components.
      const useState = React.useState;
      let opened = false;
      const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
        const open = initial === false && !opened;
        if (open) opened = true;
        return useState(open ? true : initial);
      }) as typeof React.useState);
      let html: string;
      try {
        html = render(<TopicWorkbench session={session} />);
      } finally {
        state.mockRestore();
      }
      const strings = (language === 'en' ? en : zh).grammarTopics.learning;
      expect(html).toContain('flex h-32 min-w-0 flex-col');
      if (verdict === 'unchecked') {
        expect(html).toContain(strings.result.saveFailed);
        expect(html.match(/TEST other question storage denied/g)).toHaveLength(2);
        expect(html).toContain(strings.result.readDetails);
        expect(html).not.toContain('TEST correct');
      } else {
        expect(html.includes(session.saveError!)).toBe(false);
        expect(html).not.toContain(strings.result.saveFailed);
        expect(html).toContain(strings.result[verdict]);
        expect(html).toContain(strings.result.readFeedback);
        const question = unit.items[0].topicQuestion!;
        const feedback = verdict === 'right' ? question.feedback.correct : question.feedback.byAnswer![0].message;
        expect(html.split(feedback.summary[language]).length - 1).toBeGreaterThanOrEqual(2);
        expect(html).toContain(feedback.detail![language]);
      }
    }
    await i18n.changeLanguage('en');
  });
}

test('the feedback button appears only when there is feedback or an error to read', async () => {
  const unit = await fixture();
  const unchecked = render(<TopicWorkbench session={makeSession(unit, emptyItems(unit), null)} />);
  expect(unchecked).not.toContain(en.grammarTopics.learning.result.readFeedback);
  expect(unchecked).not.toContain(en.grammarTopics.learning.result.readDetails);
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
