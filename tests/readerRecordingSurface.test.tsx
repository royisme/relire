/** Static card/drawer contracts and real component-handler probes; no layout, focus, microphone or real-provider acceptance. */
import { expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { PracticeCard } from '../src/components/reader/PracticeCard';
import { PracticeAssessment } from '../src/components/reader/PracticeAssessment';
import { WordMarks } from '../src/components/shadowing/WordMarks';
import { SentenceDrawer } from '../src/components/SentenceDrawer';
import type { PracticeCardController } from '../src/hooks/usePracticeCard';
import type { PronunciationAssessment } from '../src/types';
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
    .find((button) => button.includes(i18n.t('practiceCard.check')) || button.includes(i18n.t('shadowing.checking')))!;

// Persistent view-state slots: a captured handler's setState lands in a slot, so the next static render shows it.
const slots: unknown[] = [];
let cursor = 0;

/** Renders a factory inside the provider while slotted useState lets real handlers change card view state. */
function capture(factory: () => React.ReactElement | null) {
  cursor = 0;
  const useStore = React.useSyncExternalStore;
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((subscribe, snapshot, server) =>
    useStore(subscribe, snapshot, server ?? snapshot),
  );
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (index === slots.length) slots.push(typeof initial === 'function' ? initial() : initial);
    return [
      slots[index],
      (next: unknown) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next;
      },
    ];
  }) as typeof React.useState);
  let tree!: React.ReactElement | null;
  function Probe() {
    tree = factory();
    return tree;
  }
  try {
    return {
      html: renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <Probe />
        </I18nextProvider>,
      ),
      tree,
    };
  } finally {
    state.mockRestore();
    store.mockRestore();
  }
}

const captureCard = (assessment: PronunciationAssessment) =>
  capture(() => PracticeCard({ card: { ...card, assessment }, movable: false, onOpenLog: noop }));

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node as React.ReactElement<Record<string, unknown>>, ...elements(node.props.children)];
}

// The owner's case: a sentence whose own text contains digits, so an inline score cannot be told apart.
const numberedResult: PronunciationAssessment = {
  overallScore: 78,
  accuracyScore: 75,
  fluencyScore: 80,
  completenessScore: 85,
  wordResults: [
    { word: 'Le', accuracyScore: 95 },
    { word: 'numéro', accuracyScore: 73, errorType: 'Mispronunciation' },
    { word: '70', accuracyScore: 99 },
    { word: 'est', errorType: 'Omission' },
  ],
};

const azureResult = {
  overallScore: 78,
  accuracyScore: 75,
  fluencyScore: 80,
  completenessScore: 85,
  wordResults: [
    { word: 'Bonjour', accuracyScore: 95 },
    { word: 'tout', accuracyScore: 60, errorType: 'Mispronunciation' },
    { word: 'le', errorType: 'Omission' },
    { word: 'monde', accuracyScore: 90 },
  ],
};

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
      expect(html).toContain('min-h-[5.5rem]');
      expect(html).not.toContain('h-40');
      expect(html).not.toContain('overflow-y-auto');
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
      expect(html).toContain('min-h-[5.5rem]');
      expect(html).not.toContain('h-40');
      expect(checkButton(html)).not.toContain('disabled=""');
    }
    expect(empty).toContain(i18n.t('practiceCard.checkHint'));
    expect(empty).not.toContain(i18n.t('shadowing.overallEstimate'));
    expect(empty).not.toContain(i18n.t('practiceCard.details'));

    expect(scored).toContain(i18n.t('shadowing.overallEstimate'));
    expect(scored).toContain('>72<');
    expect(scored).toContain(i18n.t('shadowing.accuracy'));
    expect(scored).toContain('>70<');
    expect(scored).toContain(i18n.t('shadowing.fluency'));
    expect(scored).toContain('>74<');
    expect(scored).toContain(i18n.t('practiceCard.details'));

    expect(failed).toContain('role="alert"');
    expect(failed).toContain('TEST provider failed');
    expect(failed).toContain(i18n.t('shadowing.assessError'));
  });

  test(`${language}: the card with an Azure-like result shows marks in place of sentence, score strip, and Details`, async () => {
    await i18n.changeLanguage(language);
    const htmlWithAzure = render(
      <PracticeCard card={{ ...card, assessment: azureResult }} movable={false} onOpenLog={noop} />,
    );
    // WordMarks replace the plain sentence text
    expect(htmlWithAzure).toContain('decoration-wavy');
    expect(htmlWithAzure).toContain('decoration-dashed');
    expect(htmlWithAzure).toContain('>tout<');
    expect(htmlWithAzure).toContain('>le<');
    // Score strip
    expect(htmlWithAzure).toContain('>78<');
    expect(htmlWithAzure).toContain(i18n.t('shadowing.overallEstimate'));
    expect(htmlWithAzure).toContain(i18n.t('shadowing.accuracy'));
    expect(htmlWithAzure).toContain(i18n.t('shadowing.completeness'));
    expect(htmlWithAzure).toContain(i18n.t('practiceCard.details'));
    // No nested scroller
    expect(htmlWithAzure).not.toContain('h-40');

    // With no wordResults, shows plain sentence and no word marks
    const htmlNoWordResults = render(
      <PracticeCard card={{ ...card, assessment: result }} movable={false} onOpenLog={noop} />,
    );
    expect(htmlWithAzure).not.toContain('>Bonjour tout le monde.<');
    expect(htmlNoWordResults).toContain('>Bonjour tout le monde.<');
    expect(htmlNoWordResults).not.toContain('decoration-wavy');
    expect(htmlNoWordResults).not.toContain('decoration-dashed');

    // Without a result, shows the hint and Check button
    const htmlEmpty = render(<PracticeCard card={{ ...card, assessment: null }} movable={false} onOpenLog={noop} />);
    expect(htmlEmpty).toContain(i18n.t('practiceCard.checkHint'));
    expect(checkButton(htmlEmpty)).not.toContain('disabled=""');
    expect(htmlEmpty).not.toContain(i18n.t('practiceCard.details'));
  });

  test(`${language}: the marked sentence is clean of scores; screen readers keep them and the readout waits`, async () => {
    await i18n.changeLanguage(language);
    slots.length = 0;
    const { html } = captureCard(numberedResult);
    const sentence = html.match(/<button[^>]*line-clamp-2[^>]*>[\s\S]*?<\/button>/)![0];
    expect(sentence).toContain('aria-expanded="false"');
    const visible = sentence
      .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(visible).toBe('Le numéro 70 est');
    // The label and score stay attached to the word for screen readers, not as visible inline digits.
    expect(html).toContain(`${i18n.t('shadowing.wordError.Mispronunciation')} 73`);
    // The readout line below the sentence is reserved and quiet until a word is tapped.
    expect(html).toContain(i18n.t('practiceCard.wordHint'));
    expect(html).toContain('h-6');
    expect(html).not.toContain(i18n.t('shadowing.wordScore', { score: 73 }));
  });

  test(`${language}: tapping a marked word shows its score in the readout without toggling the sentence`, async () => {
    await i18n.changeLanguage(language);
    slots.length = 0;
    const first = captureCard(numberedResult);
    const marks = elements(first.tree).find((candidate) => candidate.type === WordMarks)!;
    const words = capture(() => WordMarks(marks.props as unknown as React.ComponentProps<typeof WordMarks>));
    const marked = (mark: string) =>
      elements(words.tree).find(
        (candidate) => typeof candidate.props.className === 'string' && candidate.props.className.includes(mark),
      )!;
    const tap = (element: React.ReactElement<Record<string, unknown>>) => {
      const stopPropagation = mock(() => undefined);
      (element.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation });
      return stopPropagation;
    };

    const wavyStops = tap(marked('decoration-wavy'));
    expect(wavyStops).toHaveBeenCalledTimes(1);
    const afterTap = captureCard(numberedResult);
    expect(afterTap.html).toContain('font-serif text-sm text-panel-ink">numéro<');
    expect(afterTap.html).toContain(i18n.t('shadowing.wordError.Mispronunciation'));
    expect(afterTap.html).toContain(i18n.t('shadowing.wordScore', { score: 73 }));
    expect(afterTap.html).not.toContain(i18n.t('practiceCard.wordHint'));

    // A different marked word switches the readout; an omission has no score to show.
    tap(marked('decoration-dashed'));
    const afterOmission = captureCard(numberedResult);
    expect(afterOmission.html).toContain('font-serif text-sm text-panel-ink">est<');
    expect(afterOmission.html).toContain(i18n.t('shadowing.wordError.Omission'));
    expect(afterOmission.html).not.toContain(i18n.t('shadowing.wordScore', { score: 73 }));
  });

  test(`${language}: the minimised card has neither Check nor strip, but retains record/restore/close`, async () => {
    await i18n.changeLanguage(language);
    const html = render(<PracticeCard card={{ ...card, assessment: result }} movable={false} onOpenLog={noop} />, true);
    expect(html).not.toContain(i18n.t('practiceCard.check'));
    expect(html).not.toContain(i18n.t('shadowing.check'));
    expect(html).not.toContain(i18n.t('shadowing.overallEstimate'));
    expect(html).not.toContain(i18n.t('practiceCard.details'));
    expect(html).not.toContain('min-h-[5.5rem]');
    expect(html).not.toContain('h-40');
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
