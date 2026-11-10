/** DOM-free tests of the optional explicit Ask AI in the authored sheets: configured-only visibility, states
 * inside the reserved region, token guard, no Settings navigation and no persistence. All content is TEST-only. */
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { createInstance } from 'i18next';
import { freshDb } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerTestWindow } from './fixtures/readerTestWindow';
import type { SentenceAnalysis, WordAnalysis } from '../src/types';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import { getVocabularySnapshot } from '../src/storage/vocabulary';
import { readerOccurrence } from '../src/services/gradedReaders/occurrence';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
// src/i18n reads the saved language when it loads after window exists; bun has no localStorage global.
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => undefined },
});
const access = await import('../src/services/ai/access');
const api = await import('../src/services/api');
const errors = await import('../src/services/ai/errors');
const navigation = await import('../src/hooks/useRoute');
import type { AuthoredAskAiSubject } from '../src/components/graded/AuthoredAskAi';
const { AuthoredAskAi } = await import('../src/components/graded/AuthoredAskAi');
const { ReaderAuthoredSheets } = await import('../src/components/graded/ReaderAuthoredSheets');
const { AuthoredEntry } = await import('../src/components/word/AuthoredEntry');
const { SentenceAuthored } = await import('../src/components/SentenceAuthored');
const { Button } = await import('../src/components/ui/button');
const { Link } = await import('../src/components/shell/Link');
const { SpeakButton } = await import('../src/components/ui/speak-button');
afterAll(() => {
  restoreWindow();
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const reader = publishedReaderFixture();
const vocabulary = { rows: [] } as unknown as VocabularyModel;
const fullText = reader.body.sentences.map((sentence) => sentence.fr).join('\n');
const wordSubject: AuthoredAskAiSubject = {
  kind: 'word',
  word: 'livre',
  sentence: 'Le livre est petit.',
  text: fullText,
};
const sentenceSubject: AuthoredAskAiSubject = { kind: 'sentence', sentence: 'Le livre est petit.', text: fullText };
const wordAnswer: WordAnalysis = {
  word: 'livre',
  lemma: 'livre',
  partOfSpeech: 'noun',
  ipa: '[TEST]',
  phoneticsGuide: '',
  translation: 'TEST AI 中文意思',
  translationEn: 'TEST AI book meaning',
  otherMeanings: ['TEST AI other meaning'],
  contextTense: 'TEST AI context tense note',
  usageExamples: [{ fr: 'TEST AI exemple de phrase', zh: 'TEST AI 例句中文' }],
};
const sentenceAnswer: SentenceAnalysis = {
  sentence: 'Le livre est petit.',
  translation: 'TEST AI sentence translation',
  syntaxStructure: [{ segment: 'Le livre', role: 'TEST role', explanation: 'TEST AI syntax note' }],
  grammarPoints: [
    { title: 'TEST AI grammar title', explanation: 'TEST AI grammar note', ruleFormula: 'TEST AI formula' },
  ],
  patternCollocations: [
    {
      pattern: 'TEST AI pattern',
      meaning: 'TEST AI pattern meaning',
      examples: [{ fr: 'TEST AI pattern example', zh: 'TEST AI 例句' }],
    },
  ],
  shadowingGuide: { rhythmGroups: [], liaisons: [], intonation: 'TEST AI intonation' },
};

let textConfigured = true;
let undo: (() => void)[] = [];
beforeEach(() => {
  textConfigured = true;
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: i18n.t.bind(i18n),
    i18n,
    ready: true,
  } as unknown as ReturnType<typeof translations.useTranslation>);
  const configured = spyOn(access, 'getAiAccess').mockReturnValue({
    isConfigured: () => textConfigured,
  } as never);
  undo = [() => translation.mockRestore(), () => configured.mockRestore()];
});
afterEach(() => {
  for (const restore of undo.reverse()) restore();
  undo = [];
});

/** Direct-invocation harness: hook slots like readerHookProbe, plus the unmount cleanup of the one effect. */
function askAiHarness() {
  let cursor = 0;
  const slots: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let effect: React.EffectCallback | undefined;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const at = cursor++;
    if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[at],
      (next: unknown) => {
        slots[at] = typeof next === 'function' ? next(slots[at]) : next;
      },
    ];
  }) as typeof React.useState);
  const ref = spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const at = cursor++;
    if (!(at in refs)) refs[at] = { current: initial };
    return refs[at];
  }) as typeof React.useRef);
  const mount = spyOn(React, 'useEffect').mockImplementation((callback: React.EffectCallback) => {
    effect = callback;
  });
  return {
    render: (draw: () => React.ReactNode): React.ReactNode => {
      cursor = 0;
      return draw();
    },
    /** Runs the effect and returns its cleanup, which is what a switched selection or closed sheet triggers. */
    effects: () => {
      const cleanup = effect?.();
      effect = undefined;
      return () => {
        cleanup?.();
      };
    },
    restore: () => {
      for (const spy of [state, ref, mount]) spy.mockRestore();
    },
  };
}

type FoundElement = React.ReactElement<{ children?: React.ReactNode; [key: string]: unknown }>;

function elements(node: React.ReactNode, type: React.ElementType): FoundElement[] {
  const found: FoundElement[] = [];
  const visit = (child: React.ReactNode) => {
    for (const item of React.Children.toArray(child)) {
      if (!React.isValidElement<FoundElement['props']>(item)) continue;
      if (item.type === type) found.push(item);
      visit(item.props.children);
    }
  };
  visit(node);
  return found;
}

function texts(node: React.ReactNode): string[] {
  const out: string[] = [];
  const visit = (child: React.ReactNode) => {
    for (const item of React.Children.toArray(child)) {
      if (typeof item === 'string' || typeof item === 'number') out.push(String(item));
      else if (React.isValidElement<{ children?: React.ReactNode }>(item)) visit(item.props.children);
    }
  };
  visit(node);
  return out;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const settle = () => Bun.sleep(5);

/** The Ask AI button in the rendered tree; tapping it runs the explicit request. */
function tap(tree: React.ReactNode) {
  const button = elements(tree, Button)[0];
  if (!button) throw new Error('TEST ask button not found');
  (button.props.onClick as unknown as () => void)();
}

function askButton(tree: React.ReactNode) {
  const button = elements(tree, Button)[0];
  if (!button) throw new Error('TEST ask button not found');
  return button.props as React.ComponentProps<typeof Button>;
}

test('nothing renders and nothing is called when no text AI is configured', () => {
  textConfigured = false;
  const wordAi = spyOn(api, 'fetchWordAnalysis').mockRejectedValue(new Error('TEST AI forbidden'));
  const sentenceAi = spyOn(api, 'fetchSentenceAnalysis').mockRejectedValue(new Error('TEST AI forbidden'));
  const probe = askAiHarness();
  try {
    expect(probe.render(() => AuthoredAskAi({ subject: wordSubject }))).toBeNull();
    expect(probe.render(() => AuthoredAskAi({ subject: sentenceSubject }))).toBeNull();
    expect(wordAi).not.toHaveBeenCalled();
    expect(sentenceAi).not.toHaveBeenCalled();
  } finally {
    probe.restore();
    wordAi.mockRestore();
    sentenceAi.mockRestore();
  }
});

test('both sheets wire the Ask AI into their extra slot with the full text, leaving authored content alone', () => {
  const probe = askAiHarness();
  try {
    const occurrence = readerOccurrence(reader, 's1', 0, 'C’est', 'en');
    const wordTree = probe.render(() =>
      ReaderAuthoredSheets({
        selection: { kind: 'word', occurrence },
        text: fullText,
        vocabulary,
        onClose: () => undefined,
      }),
    );
    const entry = elements(wordTree, AuthoredEntry)[0]!.props as unknown as React.ComponentProps<typeof AuthoredEntry>;
    expect(entry.spelling).toBe('C’est');
    expect(entry.entry).toEqual(occurrence.entries[0]);
    const wordAsk = elements(entry.extra, AuthoredAskAi);
    expect(wordAsk).toHaveLength(1);
    expect(wordAsk[0]!.props.subject).toEqual({
      kind: 'word',
      word: 'C’est',
      sentence: 'C’est un livre.',
      text: fullText,
    });
    expect(elements(entry.extra, SpeakButton)).toHaveLength(1);

    const sentenceTree = probe.render(() =>
      ReaderAuthoredSheets({
        selection: { kind: 'sentence', sentence: reader.body.sentences[1]! },
        text: fullText,
        vocabulary,
        onClose: () => undefined,
      }),
    );
    const authored = elements(sentenceTree, SentenceAuthored)[0]!.props as unknown as React.ComponentProps<
      typeof SentenceAuthored
    >;
    expect(authored.revealed).toBe(false);
    const sentenceAsk = elements(authored.extra, AuthoredAskAi);
    expect(sentenceAsk).toHaveLength(1);
    expect(sentenceAsk[0]!.props.subject).toEqual(sentenceSubject);
  } finally {
    probe.restore();
  }
});

test('a configured word control calls the shared lookup only when tapped', async () => {
  const wordAi = spyOn(api, 'fetchWordAnalysis').mockResolvedValue(wordAnswer);
  undo.push(() => wordAi.mockRestore());
  const probe = askAiHarness();
  try {
    const tree = () => probe.render(() => AuthoredAskAi({ subject: wordSubject }));
    expect(askButton(tree()).disabled).toBe(false);
    expect(wordAi).not.toHaveBeenCalled();
    tap(tree());
    expect(wordAi).toHaveBeenCalledTimes(1);
    expect(wordAi).toHaveBeenCalledWith('livre', 'Le livre est petit.', fullText);
    await settle();
  } finally {
    probe.restore();
  }
});

test('the reserved region holds loading, result and error states while the button carries the spinner', async () => {
  const first = deferred<WordAnalysis>();
  const second = deferred<WordAnalysis>();
  const wordAi = spyOn(api, 'fetchWordAnalysis').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  undo.push(() => wordAi.mockRestore());
  const probe = askAiHarness();
  try {
    const tree = () => probe.render(() => AuthoredAskAi({ subject: wordSubject }));
    tap(tree());
    // Loading: the spinner state is on the button itself; the reserved region stays empty.
    expect(askButton(tree()).disabled).toBe(true);
    expect(askButton(tree())['aria-busy']).toBe(true);
    expect(texts(tree()).join('\n')).not.toContain('TEST AI');

    first.resolve(wordAnswer);
    await settle();
    const answerText = texts(tree()).join('\n');
    expect(answerText).toContain(i18n.t('gradedReader.ai.answer'));
    expect(answerText).toContain('TEST AI book meaning');
    expect(answerText).toContain('TEST AI context tense note');
    expect(answerText).toContain('TEST AI exemple de phrase');
    expect(askButton(tree()).disabled).toBe(false);

    tap(tree());
    second.reject(new Error('TEST AI network down'));
    await settle();
    const errorText = texts(tree()).join('\n');
    expect(errorText).toContain('TEST AI network down');
    expect(errorText).not.toContain('TEST AI book meaning');
    expect(askButton(tree()).disabled).toBe(false);
  } finally {
    probe.restore();
  }
});

test('a missing key found after a tap shows the real error and an explicit Settings link, never navigation', async () => {
  const wordAi = spyOn(api, 'fetchWordAnalysis').mockRejectedValue(new errors.MissingApiKeyError());
  const navigate = spyOn(navigation, 'navigate').mockImplementation(() => undefined);
  undo.push(
    () => wordAi.mockRestore(),
    () => navigate.mockRestore(),
  );
  const probe = askAiHarness();
  try {
    const tree = () => probe.render(() => AuthoredAskAi({ subject: wordSubject }));
    tap(tree());
    await settle();
    expect(texts(tree()).join('\n')).toContain('API key is not set');
    const settings = elements(tree(), Link);
    expect(settings).toHaveLength(1);
    expect(settings[0]!.props.to).toEqual({
      name: 'settings',
      section: 'ai',
      purpose: 'text',
      focusKey: true,
      returnTo: '#/read',
    });
    expect(navigate).not.toHaveBeenCalled();
  } finally {
    probe.restore();
  }
});

test('a late answer after the sheet switched or closed is ignored', async () => {
  const pending = deferred<WordAnalysis>();
  const wordAi = spyOn(api, 'fetchWordAnalysis').mockReturnValue(pending.promise);
  undo.push(() => wordAi.mockRestore());
  const probe = askAiHarness();
  try {
    const tree = () => probe.render(() => AuthoredAskAi({ subject: wordSubject }));
    void tree();
    const unmount = probe.effects();
    tap(tree());
    unmount();
    pending.resolve(wordAnswer);
    await settle();
    expect(texts(tree()).join('\n')).not.toContain('TEST AI book meaning');
    expect(texts(tree()).join('\n')).not.toContain(i18n.t('gradedReader.ai.answer'));
  } finally {
    probe.restore();
  }
});

test('the sentence request reuses the sentence analysis and keeps the authored translation authoritative', async () => {
  const sentenceAi = spyOn(api, 'fetchSentenceAnalysis').mockResolvedValue(sentenceAnswer);
  undo.push(() => sentenceAi.mockRestore());
  const probe = askAiHarness();
  try {
    const tree = () => probe.render(() => AuthoredAskAi({ subject: sentenceSubject }));
    tap(tree());
    expect(sentenceAi).toHaveBeenCalledWith('Le livre est petit.', fullText);
    await settle();
    const answerText = texts(tree()).join('\n');
    expect(answerText).toContain('TEST AI syntax note');
    expect(answerText).toContain('TEST AI grammar note');
    expect(answerText).toContain('TEST AI pattern example');
    // The AI's own translation and shadowing guide stay out: the authored translation is the authority here.
    expect(answerText).not.toContain('TEST AI sentence translation');
    expect(answerText).not.toContain('TEST AI intonation');
  } finally {
    probe.restore();
  }
});

test('a successful AI answer is never written into the vocabulary rows', async () => {
  await freshDb();
  const wordAi = spyOn(api, 'fetchWordAnalysis').mockResolvedValue(wordAnswer);
  undo.push(() => wordAi.mockRestore());
  const probe = askAiHarness();
  try {
    const tree = () => probe.render(() => AuthoredAskAi({ subject: wordSubject }));
    tap(tree());
    await settle();
    expect(texts(tree()).join('\n')).toContain('TEST AI book meaning');
    expect((await getVocabularySnapshot('livre')).row).toBeUndefined();
  } finally {
    probe.restore();
  }
});
