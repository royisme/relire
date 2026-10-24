/** DOM-free integration wiring: snapshot gate, stale reload, authored actions and device playback props. No real AI/voice. */
import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { createInstance } from 'i18next';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { freshDb } from './fixtures/storage';
import * as storage from '../src/storage/gradedReaders';
import { readerTestWindow } from './fixtures/readerTestWindow';
import * as api from '../src/services/api';
import * as speech from '../src/utils/speech';
import * as practice from '../src/hooks/useReaderPracticeCard';
import * as touch from '../src/hooks/useTouchLayout';

import { ReaderWord } from '../src/components/reader/ReaderWord';

import { SentenceBar } from '../src/components/reader/SentenceBar';
import { ReaderSentenceToolbar } from '../src/components/reader/ReaderSentenceToolbar';
import { SpeakButton } from '../src/components/ui/speak-button';
import { AuthoredEntry } from '../src/components/word/AuthoredEntry';
import { useReaderWorkspace } from '../src/hooks/useReaderWorkspace';
import { readerOccurrence } from '../src/services/gradedReaders/occurrence';
import { gradedDocument } from '../src/types/readerSource';
import { emptyAnswer } from '../src/services/exercises/answer';
import { readerQuestionItem } from '../src/services/gradedReaders/checkpoints';
import { getVocabularySnapshot } from '../src/storage/vocabulary';
import * as packs from '../src/hooks/useGradedReaders';
import { loadStarterReaders, resetStarterReadersForTests } from '../src/services/gradedReaders/load';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const restoreWindow = readerTestWindow();
const navigation = await import('../src/hooks/useRoute');
const { GradedReaderPage, ReaderEditionGate } = await import('../src/components/graded/GradedReaderPage');
const { GradedReaderWorkspace } = await import('../src/components/graded/GradedReaderWorkspace');
const { ReaderAuthoredSheets } = await import('../src/components/graded/ReaderAuthoredSheets');
const { ReaderView } = await import('../src/components/ReaderView');
const { ReaderPreferences } = await import('../src/components/reader/ReaderPreferences');
afterAll(restoreWindow);

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const reader = publishedReaderFixture();
const vocabulary = { rows: [] } as unknown as VocabularyModel;
const noop = () => undefined;
let probe: ReturnType<typeof readerHookProbe>;
let undo: (() => void)[];
beforeEach(async () => {
  await freshDb();
  probe = readerHookProbe();
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: i18n.t.bind(i18n),
    i18n,
    ready: true,
  } as unknown as ReturnType<typeof translations.useTranslation>);
  undo = [() => translation.mockRestore()];
});
afterEach(async () => {
  probe.restore();
  for (const restore of undo.reverse()) restore();
  resetStarterReadersForTests();
  await Bun.sleep(5);
});
function element<P>(node: React.ReactNode, type: React.ElementType): React.ReactElement<P> {
  const visit = (child: React.ReactNode): React.ReactElement<P> | undefined => {
    for (const item of React.Children.toArray(child)) {
      if (!React.isValidElement<{ children?: React.ReactNode }>(item)) continue;
      if (item.type === type) return item as React.ReactElement<P>;
      const found = visit(item.props.children);
      if (found) return found;
    }
  };
  const found = visit(node);
  if (!found) throw new Error(`TEST element not found: ${String(type)}`);
  return found;
}
async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await Bun.sleep(5);
  expect(done()).toBe(true);
}

test('the workspace is absent until the snapshot commit resolves; failure keeps a retryable bounded gate', async () => {
  const original = storage.openReaderEdition;
  let release!: () => void;
  const delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  const open = spyOn(storage, 'openReaderEdition').mockImplementation(async (...args) => {
    await delay;
    return original(...args);
  });
  undo.push(() => open.mockRestore());
  const draw = () => probe.render(() => ReaderEditionGate({ reader, vocabulary, onOpenShadowingLog: noop }));
  expect(draw().type).not.toBe(GradedReaderWorkspace);
  probe.effects();
  expect(open).toHaveBeenCalledTimes(1);
  expect(draw().type).not.toBe(GradedReaderWorkspace);
  release();
  await until(() => draw().type === GradedReaderWorkspace);
  expect((await storage.listReaderProgress())[0].completedAt).toBeNull();
  expect(draw().props.opened.row.snapshot).toEqual(reader);
});

test('failed open offers storage-only Retry and never mounts a writable workspace', async () => {
  const original = storage.openReaderEdition;
  const open = spyOn(storage, 'openReaderEdition').mockRejectedValueOnce(new Error('TEST snapshot denied'));
  undo.push(() => open.mockRestore());
  const draw = () => probe.render(() => ReaderEditionGate({ reader, vocabulary, onOpenShadowingLog: noop }));
  draw();
  probe.effects();
  await until(() => draw().props.error === 'TEST snapshot denied');
  expect(draw().type).not.toBe(GradedReaderWorkspace);
  open.mockImplementation(original);
  draw().props.retry();
  draw();
  probe.effects();
  await until(() => draw().type === GradedReaderWorkspace);
});

test('detail route resolves known/unknown/unavailable pin, never writes a substitute edition', async () => {
  resetStarterReadersForTests();
  await loadStarterReaders({ schemaVersion: 1, syllabusVersion: '1.0.0', readers: [reader] });
  const pack = spyOn(packs, 'useGradedReaders').mockReturnValue({ status: 'ready', readers: [reader], retry: noop });
  undo.push(() => pack.mockRestore());
  const draw = (readerId: string, version?: string) =>
    probe.render(() => GradedReaderPage({ readerId, version, vocabulary, onOpenShadowingLog: noop }));
  expect(draw(reader.body.id).type).toBe(ReaderEditionGate);
  expect(draw(reader.body.id, reader.version).type).toBe(ReaderEditionGate);
  expect(draw(reader.body.id, 'a'.repeat(64)).props.missing).toBe(true);
  expect(draw('test-unknown').props.missing).toBe(true);
  expect(await storage.listReaderProgress()).toEqual([]);
});

test('debounce persists the latest draft; a stale revision triggers edition reload without overwriting its answer', async () => {
  const opened = await storage.openReaderEdition(reader);
  const reload = spyOn({ reload: noop }, 'reload');
  const draw = () => probe.render(() => useReaderWorkspace(opened, reload));
  draw();
  probe.effects();
  const question = reader.body.learning.checkpoints[0].questions[0];
  const id = question.question.id;
  const answer = { ...emptyAnswer(readerQuestionItem(question)), choiceSelections: ['un livre'] };
  draw().change(id, answer);
  expect((await storage.listReaderProgress())[0].answers[id]).toBeUndefined();
  await Bun.sleep(350);
  await until(() => draw().row.revision === 1);
  const competing = await storage.openReaderEdition(reader);
  await storage.saveReaderAnswer(competing.session, id, { ...answer, choiceSelections: ['le livre'] });
  draw().check(id);
  await until(() => reload.mock.calls.length === 1);
  const reloaded = await storage.openReaderEdition(reader);
  expect(reloaded.row.answers[id].answer.choiceSelections).toEqual(['le livre']);
  expect(reloaded.row.answers[id].checked).toBeNull();
  expect(reloaded.row.completedAt).toBeNull();
});

test('authored route actions never call AI or Settings; word and sentence selections keep their exact occurrence', async () => {
  const wordAi = spyOn(api, 'fetchWordAnalysis').mockRejectedValue(new Error('TEST AI forbidden'));
  const sentenceAi = spyOn(api, 'fetchSentenceAnalysis').mockRejectedValue(new Error('TEST AI forbidden'));
  const navigate = spyOn(navigation, 'navigate').mockImplementation(noop);
  undo.push(
    () => wordAi.mockRestore(),
    () => sentenceAi.mockRestore(),
    () => navigate.mockRestore(),
  );
  const opened = await storage.openReaderEdition(reader);
  const draw = () =>
    probe.render(() => GradedReaderWorkspace({ opened, vocabulary, reload: noop, onOpenShadowingLog: noop }));
  const view = () => element<React.ComponentProps<typeof ReaderView>>(draw(), ReaderView).props;
  view().authored!.onWord('livre', 's2', 1);
  const sheets = element<React.ComponentProps<typeof ReaderAuthoredSheets>>(draw(), ReaderAuthoredSheets).props;
  expect(sheets.selection.kind).toBe('word');
  if (sheets.selection.kind === 'word') expect(sheets.selection.occurrence.sentence.id).toBe('s2');
  view().authored!.onSentence('s3');
  expect(
    element<React.ComponentProps<typeof ReaderAuthoredSheets>>(draw(), ReaderAuthoredSheets).props.selection,
  ).toEqual({ kind: 'sentence', sentence: reader.body.sentences[2] });
  expect(wordAi).not.toHaveBeenCalled();
  expect(sentenceAi).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  view().onBack();
  expect(navigate).toHaveBeenCalledWith({ name: 'gradedReaders' });
});

test('the authored footer passes clicked spelling and the reader definition to durable bookmark storage', async () => {
  const occurrence = readerOccurrence(reader, 's1', 0, 'C’est', 'en');
  const draw = () =>
    probe.render(() => ReaderAuthoredSheets({ selection: { kind: 'word', occurrence }, vocabulary, onClose: noop }));
  const entry = element<React.ComponentProps<typeof AuthoredEntry>>(draw(), AuthoredEntry);
  probe.effects();
  entry.props.onSave();
  await until(() => !element<React.ComponentProps<typeof AuthoredEntry>>(draw(), AuthoredEntry).props.pending);
  const row = (await getVocabularySnapshot('c’est')).row!;
  expect(row.word).toBe('C’est');
  expect(row.contexts[0].definition).toEqual(occurrence.definition);
  const extra = element<React.ComponentProps<typeof AuthoredEntry>>(draw(), AuthoredEntry).props.extra;
  expect(element<React.ComponentProps<typeof SpeakButton>>(extra, SpeakButton).props.engine).toBe('device');
});

test('floating and touch sentence controls forward the device engine to SpeakButton with Translation', () => {
  const toolbar = probe.render(() =>
    ReaderSentenceToolbar({
      t: i18n.t.bind(i18n),
      toolbar: { id: 's1', text: reader.body.sentences[0].fr, top: 0, left: 0 },
      cancelClear: noop,
      scheduleClear: noop,
      speechActive: false,
      onExplain: noop,
      cardBusy: false,
      practisedId: null,
      playbackEngine: 'device',
      explainLabel: i18n.t('gradedReader.translation'),
    }),
  );
  expect(element<React.ComponentProps<typeof SpeakButton>>(toolbar, SpeakButton).props.engine).toBe('device');
  const bar = probe.render(() =>
    SentenceBar({
      text: reader.body.sentences[0].fr,
      practiseBlocked: false,
      onExplain: noop,
      onDismiss: noop,
      playbackEngine: 'device',
      explainLabel: i18n.t('gradedReader.translation'),
    }),
  );
  expect(element<React.ComponentProps<typeof SpeakButton>>(bar, SpeakButton).props.engine).toBe('device');
});

test('ReaderView captures sentence id and ordinal and forwards device voice to sequence, sentence bar and practice reference', () => {
  const original = practice.useReaderPracticeCard;
  const card = spyOn(practice, 'useReaderPracticeCard').mockImplementation(original);
  const device = spyOn(touch, 'useTouchLayout').mockReturnValue(true);
  const sequence = spyOn(speech, 'startSequence').mockImplementation(noop);
  const onWord = spyOn({ onWord: noop }, 'onWord');
  undo.push(
    () => card.mockRestore(),
    () => device.mockRestore(),
    () => sequence.mockRestore(),
  );
  const props: React.ComponentProps<typeof ReaderView> = {
    readingDocument: gradedDocument(reader, i18n.t.bind(i18n)),
    source: { kind: 'graded', readerId: reader.body.id, version: reader.version },
    onBack: noop,
    onMissingKey: noop,
    onOpenShadowingLog: noop,
    activeWord: null,
    activeSentence: null,
    playbackEngine: 'device',
    authored: { sentenceIds: reader.body.sentences.map((sentence) => sentence.id), onWord, onSentence: noop },
  };
  const draw = () => probe.render(() => ReaderView(props) as React.ReactNode);
  const word = element<React.ComponentProps<typeof ReaderWord>>(draw(), ReaderWord);
  // The ReaderWord lookup spelling may omit an elided prefix; the authored callback must retain the displayed token.
  word.props.onClick('est');
  expect(onWord).toHaveBeenCalledWith('C’est', 's1', 0);
  const preferences = element<React.ComponentProps<typeof ReaderPreferences>>(draw(), ReaderPreferences);
  preferences.props.toggleListening();
  expect(sequence).toHaveBeenCalledWith(
    expect.stringContaining(reader.version),
    reader.body.sentences.map((sentence) => sentence.fr),
    0,
    'device',
  );
  const bar = element<React.ComponentProps<typeof SentenceBar>>(draw(), SentenceBar);
  expect(bar.props.playbackEngine).toBe('device');
  // R1-10: graded editions are recordable; the bar and pill offer practise like articles and passages.
  expect(bar.props.onPractise).toBeInstanceOf(Function);
  expect(bar.props.explainLabel).toBe(i18n.t('gradedReader.translation'));
  expect(card.mock.calls[0][2]).toBe('device');
});
