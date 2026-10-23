/** Static card/drawer contracts only: no layout, focus, microphone or real-provider acceptance. */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { PracticeCard } from '../src/components/reader/PracticeCard';
import { PracticeAssessment } from '../src/components/reader/PracticeAssessment';
import { SentenceDrawer } from '../src/components/SentenceDrawer';
import type { PracticeCardController } from '../src/hooks/usePracticeCard';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const noop = () => undefined;
const result = { overallScore: 72, accuracyScore: 70, fluencyScore: 74 };
const card: PracticeCardController = {
  phase: 'ready',
  target: { source: { kind: 'article', articleId: 'TEST-article' }, sentenceId: '0-0', text: 'Bonjour tout le monde.' },
  latest: {
    id: 'TEST-take',
    blob: new Blob(['TEST audio']),
    mimeType: 'audio/webm',
    recordedAt: 1,
    durationMs: 1000,
    bytes: 10,
  },
  count: 1,
  elapsedMs: 0,
  error: null,
  notice: null,
  assessment: null,
  assessmentError: null,
  isEvaluating: false,
  assess: async () => undefined,
  open: () => true,
  stop: async () => undefined,
  redo: noop,
  close: noop,
  retrySave: noop,
  discardUnsaved: noop,
  interrupt: noop,
  playReference: noop,
  playLatest: noop,
  compare: noop,
  level: () => 0,
};

function render(node: React.ReactNode, minimised = false) {
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    useStore(subscribe, snapshot, server ?? snapshot),
  );
  // Select the card's third boolean view state (minimised), not recording/controller state.
  const useState = React.useState;
  let booleans = 0;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const pair = useState(initial);
    return initial === false && ++booleans === 3 && minimised ? [true, pair[1]] : pair;
  }) as typeof React.useState);
  try {
    return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  } finally {
    state.mockRestore();
    store.mockRestore();
  }
}
const checkButton = (html: string) =>
  html
    .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!
    .find((button) => button.includes(i18n.t('shadowing.check')) || button.includes(i18n.t('shadowing.checking')))!;

for (const language of ['en', 'zh']) {
  test(`${language}: Check is disabled without a take, during checking, and while a new take starts`, async () => {
    await i18n.changeLanguage(language);
    expect(checkButton(render(<PracticeAssessment card={card} />))).not.toContain('disabled=""');
    for (const changed of [
      { latest: null },
      { isEvaluating: true },
      { phase: 'acquiring' as const },
      { phase: 'recording' as const },
      { phase: 'saving' as const },
    ]) {
      const html = render(<PracticeAssessment card={{ ...card, ...changed }} />);
      expect(checkButton(html)).toContain('disabled=""');
      expect(html).toContain('h-40 overflow-y-auto');
    }
  });

  test(`${language}: the expanded card always reserves a result slot, shows the estimate and real inline error`, async () => {
    await i18n.changeLanguage(language);
    const draw = (changes: Partial<PracticeCardController>) =>
      render(<PracticeCard card={{ ...card, ...changes }} movable={false} onOpenLog={noop} />);
    const empty = draw({});
    const scored = draw({ assessment: result });
    const failed = draw({ assessmentError: 'TEST provider failed' });
    for (const html of [empty, scored, failed]) {
      expect(html).toContain('h-40 overflow-y-auto');
      expect(checkButton(html)).not.toContain('disabled=""');
    }
    expect(empty).not.toContain(i18n.t('shadowing.estimate'));
    expect(scored).toContain(i18n.t('shadowing.estimate'));
    expect(scored).toContain('>72<');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('TEST provider failed');
    expect(failed).toContain(i18n.t('shadowing.assessError'));
  });

  test(`${language}: the minimised card has neither Check nor assessment, but retains record/restore/close`, async () => {
    await i18n.changeLanguage(language);
    const html = render(<PracticeCard card={{ ...card, assessment: result }} movable={false} onOpenLog={noop} />, true);
    expect(html).not.toContain(i18n.t('shadowing.check'));
    expect(html).not.toContain(i18n.t('shadowing.estimate'));
    expect(html).not.toContain('h-40 overflow-y-auto');
    expect(html).toContain(i18n.t('practiceCard.recordAgain'));
    expect(html).toContain(i18n.t('practiceCard.restore'));
    expect(html).toContain(i18n.t('common.close'));
  });

  test(`${language}: the drawer keeps analysis, guidance and listening, with no recorder, Check or recorder heading`, async () => {
    await i18n.changeLanguage(language);
    const html = render(
      <SentenceDrawer
        isOpen
        onClose={noop}
        isLoading={false}
        sentenceData={{
          sentence: 'Bonjour tout le monde.',
          translation: 'TEST translation',
          syntaxStructure: [{ segment: 'Bonjour', role: 'TEST role', explanation: 'TEST syntax' }],
          grammarPoints: [{ title: 'TEST grammar', explanation: 'TEST rule' }],
          patternCollocations: [{ pattern: 'TEST pattern', meaning: 'TEST meaning', examples: [] }],
          shadowingGuide: { speedTip: 'TEST pace', rhythmGroups: [], liaisons: [], intonation: 'TEST intonation' },
        }}
      />,
    );
    for (const text of ['TEST translation', 'TEST syntax', 'TEST rule', 'TEST pattern', 'TEST pace', 'TEST intonation'])
      expect(html).toContain(text);
    expect(html).toContain(i18n.t('sentenceDrawer.listenAudio'));
    expect(html).not.toContain(i18n.t('shadowing.record'));
    expect(html).not.toContain(i18n.t('shadowing.check'));
    expect(html).not.toContain('shadowing-title');
    expect(html).not.toContain('<audio');
  });
}
