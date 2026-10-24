/** Real public bundled readers cross feature/storage boundaries; only learner answers and audio are TEST data. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createInstance } from 'i18next';
import * as React from 'react';
import * as translations from 'react-i18next';
import { freshDb, failure } from './fixtures/storage';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { exportData, importData } from '../src/storage/db';
import {
  openReaderEdition,
  listReaderProgress,
  saveReaderAnswer,
  checkReaderAnswer,
  redoReaderQuestion,
  setReaderCompletion,
} from '../src/storage/gradedReaders';
import {
  addTake,
  exportShadowing,
  listShadowing,
  parseShadowingBackup,
  shadowingRestored,
} from '../src/storage/shadowing';
import { saveVocabularyBookmark } from '../src/storage/vocabulary';
import { loadStarterReaders, resetStarterReadersForTests } from '../src/services/gradedReaders/load';
import { gradeReaderQuestion, readerQuestionItem } from '../src/services/gradedReaders/checkpoints';
import { readerOccurrence } from '../src/services/gradedReaders/occurrence';
import { choiceGroups, emptyAnswer } from '../src/services/exercises/answer';
import { vocabularyKey } from '../src/services/vocabulary/identity';
import { vocabularyHash } from '../src/services/vocabulary/book';
import { readerWords } from '../src/utils/readerTokens';
import { useShadowingLog } from '../src/hooks/useShadowingLog';
import { BackupControls } from '../src/components/settings/BackupControls';
import type { ReaderQuestion } from '../src/types/gradedReader';
import en from '../src/i18n/locales/en.json';

beforeEach(async () => {
  await freshDb();
  resetStarterReadersForTests();
});
afterEach(resetStarterReadersForTests);

async function bundledReaders() {
  const readers = await loadStarterReaders();
  expect(
    readers.length,
    'The committed starter must not be empty: no reader journey would be exercised',
  ).toBeGreaterThan(0);
  return readers;
}

function answerFor(item: ReaderQuestion, text: string) {
  const answer = emptyAnswer(readerQuestionItem(item));
  if (item.question.type === 'CHOICE_SELECT') answer.choiceSelections = [text];
  else answer.singleAnswer = text;
  return answer;
}

/** Bun has no FileReader; encode the actual TEST blobs, without replacing exportShadowing. */
async function recordingBackup() {
  const original = globalThis.FileReader;
  globalThis.FileReader = class {
    result: string | null = null;
    onload: (() => void) | null = null;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((bytes) => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.();
      });
    }
  } as unknown as typeof FileReader;
  try {
    return await exportShadowing();
  } finally {
    if (original) globalThis.FileReader = original;
    else Reflect.deleteProperty(globalThis, 'FileReader');
  }
}

async function learnerJourney() {
  const readers = await bundledReaders();
  for (const reader of readers) {
    let current = await openReaderEdition(reader, 10);
    expect(current.row.snapshot).toEqual(reader);
    expect(current.row.completedAt).toBeNull();
    const questions = reader.body.learning.checkpoints.flatMap((checkpoint) => checkpoint.questions);
    for (const item of questions) {
      const id = item.question.id;
      const right = answerFor(item, item.question.expectedAnswer);
      const wrongText =
        item.question.type === 'CHOICE_SELECT'
          ? choiceGroups(item.question.prompt)[0].find(
              (option) => !gradeReaderQuestion(item, answerFor(item, option)).correct,
            )
          : `${item.question.expectedAnswer} TEST wrong`;
      expect(wrongText, `${reader.body.id}/${id} needs a wrong answer`).toBeDefined();
      for (const [answer, correct] of [
        [right, true],
        [answerFor(item, wrongText!), false],
      ] as const) {
        current = await saveReaderAnswer(current.session, id, answer);
        expect(current.row.answers[id]).toEqual({ answer, checked: null });
        expect(gradeReaderQuestion(item, answer).correct).toBe(correct);
        current = await checkReaderAnswer(current.session, id, gradeReaderQuestion, 20);
        expect(current.row.answers[id].checked).toEqual({ correct, strictAccents: true, checkedAt: 20 });
        expect((await listReaderProgress()).find((row) => row.readerId === reader.body.id)).toEqual(current.row);
        if (correct) current = await redoReaderQuestion(current.session, id);
      }
      if (item.question.type === 'FILL_BLANKS') {
        // Add or remove an accent on the real answer, keeping every other character identical.
        const expected = item.question.expectedAnswer;
        const stripped = expected.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
        const accentOnly =
          stripped === expected ? expected.replace(/[aeiou]/i, (vowel) => `${vowel}\u0301`).normalize('NFC') : stripped;
        expect(accentOnly).not.toBe(expected);
        current = await redoReaderQuestion(current.session, id);
        current = await saveReaderAnswer(current.session, id, answerFor(item, accentOnly));
        current = await checkReaderAnswer(current.session, id, gradeReaderQuestion, 25);
        expect(current.row.answers[id].checked).toEqual({ correct: false, strictAccents: true, checkedAt: 25 });
      }
    }
    const redo = questions[0];
    const beforeRedo = current.row.answers;
    current = await redoReaderQuestion(current.session, redo.question.id);
    const { [redo.question.id]: _removed, ...retained } = beforeRedo;
    expect(current.row.answers).toEqual(retained);
    current = await saveReaderAnswer(current.session, redo.question.id, answerFor(redo, redo.question.expectedAnswer));
    current = await checkReaderAnswer(current.session, redo.question.id, gradeReaderQuestion, 30);
    expect(current.row.completedAt).toBeNull();
    current = await setReaderCompletion(current.session, true, 40);
    expect(current.row.completedAt).toBe(40);
    current = await setReaderCompletion(current.session, false, 50);
    expect(current.row.completedAt).toBeNull();
    current = await setReaderCompletion(current.session, true, 60);
    expect(current.row.completedAt).toBe(60);

    // Prefer a clicked inflection over its lemma, so lemma-based identity cannot pass unnoticed.
    const occurrences = reader.body.sentences.flatMap((sentence) =>
      readerWords(sentence.fr).map((word) => readerOccurrence(reader, sentence.id, word.ordinal, word.lookup, 'en')),
    );
    const occurrence = occurrences.find(
      (entry) => vocabularyKey(entry.lookup.word) !== vocabularyKey(entry.definition.entry.lemma),
    );
    expect(
      occurrence,
      `${reader.body.id} needs an inflected/elided occurrence for clicked-spelling identity`,
    ).toBeDefined();
    const { lookup, definition, sentence } = occurrence!;
    const saved = await saveVocabularyBookmark(lookup, definition, undefined, 70);
    expect(saved.key).toBe(vocabularyKey(lookup.word));
    expect(saved.key).not.toBe(vocabularyKey(definition.entry.lemma));
    expect(saved.contexts).toContainEqual({
      id: saved.contexts.at(-1)!.id,
      sentence: sentence.fr,
      savedAt: 70,
      requestLanguage: 'en',
      source: lookup.source,
      definition,
    });
    await addTake({ kind: 'graded', readerId: reader.body.id, version: reader.version }, sentence.fr, {
      blob: new Blob([`TEST recording ${reader.body.id}`], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      durationMs: 900,
      recordedAt: 80,
    });
  }
  const data = await exportData();
  expect(data.gradedReaders).toHaveLength(readers.length);
  expect(data.articles).toEqual([]);
  expect(data.units).toEqual([]);
  expect(data.itemStates).toEqual([]);
  expect(data.attempts).toEqual([]);
  return JSON.parse(JSON.stringify({ ...data, shadowing: await recordingBackup() })) as typeof data & {
    shadowing: Awaited<ReturnType<typeof exportShadowing>>;
  };
}

test('every real bundled edition survives the whole learner journey and a JSON backup/restore', async () => {
  const backup = await learnerJourney();
  await freshDb();
  expect(await listReaderProgress()).toEqual([]);
  expect(await listShadowing()).toEqual([]);
  // BackupControls decodes recordings before the whole transaction and notifies after it commits.
  const shadowing = parseShadowingBackup(backup.shadowing);
  await importData({ ...backup, shadowing }, gradeReaderQuestion);
  shadowingRestored();
  const { shadowing: _recordings, ...data } = backup;
  expect(await exportData()).toEqual(data);
  expect(await recordingBackup()).toEqual(backup.shadowing);
  for (const row of await listReaderProgress()) {
    expect(await vocabularyHash(row.snapshot.body)).toBe(row.version);
    expect(row.snapshot.review.contentHash).toBe(row.version);
    const reopened = await openReaderEdition(row.snapshot, 90);
    expect(reopened.row).toEqual({ ...row, lastOpenedAt: 90 });
  }
  for (const record of await listShadowing()) {
    expect(record.graded).toBeDefined();
    expect(await record.takes[0].blob.text()).toBe(`TEST recording ${record.graded!.readerId}`);
  }
});

test('real-data restore rejects malformed readers whole; absent preserves progress and [] clears only progress', async () => {
  const backup = await learnerJourney();
  const original = await exportData();
  const recordings = await recordingBackup();
  for (const gradedReaders of [null, {}, [{ ...backup.gradedReaders[0], version: 'TEST invalid hash' }]]) {
    expect(
      await failure(importData({ ...original, vocab: [], shadowing: [], gradedReaders }, gradeReaderQuestion)),
    ).toBeInstanceOf(Error);
    expect(await exportData()).toEqual(original);
    expect(await recordingBackup()).toEqual(recordings);
  }
  await importData({ stats: original.stats });
  expect(await exportData()).toEqual(original);
  await importData({ gradedReaders: [] });
  expect(await exportData()).toEqual({ ...original, gradedReaders: [] });
  expect(await recordingBackup()).toEqual(recordings);

  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: en } }, initAsync: false });
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: i18n.t.bind(i18n),
    i18n,
    ready: true,
  } as unknown as ReturnType<typeof translations.useTranslation>);
  const probe = readerHookProbe();
  try {
    const render = () => probe.render(() => useShadowingLog([], [], null));
    render();
    probe.effects();
    let log = render();
    for (let retry = 0; log.loading && retry < 100; retry++) {
      await Bun.sleep(1);
      log = render();
    }
    expect(log.loading).toBe(false);
    expect(log.error).toBeNull();
    expect(log.removed).toEqual([]);
    expect(log.groups).toHaveLength(backup.gradedReaders.length);
    for (const group of log.groups) {
      expect(group.unavailable).toBe(true);
      expect(group.rows).toHaveLength(1);
      const record = group.rows[0].record;
      expect(group.document.title).toBe(i18n.t('shadowingLog.unavailableEdition', { id: record.graded!.readerId }));
      expect(await record.takes[0].blob.text()).toBe(`TEST recording ${record.graded!.readerId}`);
    }
  } finally {
    probe.restore();
    translation.mockRestore();
  }
});

test('Settings BackupControls restores checked real-reader backups without losing learner data', async () => {
  const backup = await learnerJourney();
  await freshDb();
  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: en } }, initAsync: false });
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: i18n.t.bind(i18n),
    i18n,
    ready: true,
  } as unknown as ReturnType<typeof translations.useTranslation>);
  const probe = readerHookProbe();
  const original = globalThis.FileReader;
  let imported: Promise<unknown> | undefined;
  globalThis.FileReader = class {
    onload: ((event: { target: { result: string } }) => Promise<void>) | null = null;
    readAsText(file: Blob) {
      imported = file.text().then((result) => this.onload?.({ target: { result } }));
    }
  } as unknown as typeof FileReader;
  // The actual Settings handler schedules a reload only after success; never run that timer here.
  const timer = spyOn(globalThis, 'setTimeout').mockReturnValue(0 as unknown as ReturnType<typeof setTimeout>);
  try {
    const tree = probe.render(() => BackupControls({ audioBytes: 0, shadowingBytes: 0 })) as React.ReactElement<{
      children: React.ReactNode;
    }>;
    type InputProps = {
      type?: string;
      children?: React.ReactNode;
      onChange: React.ChangeEventHandler<HTMLInputElement>;
    };
    function findInput(node: React.ReactNode): React.ReactElement<InputProps> | undefined {
      for (const child of React.Children.toArray(node)) {
        if (!React.isValidElement<InputProps>(child)) continue;
        if (child.type === 'input' && child.props.type === 'file') return child;
        const found = findInput(child.props.children);
        if (found) return found;
      }
    }
    const input = findInput(tree);
    expect(input).toBeDefined();
    const onChange = input!.props.onChange;
    onChange({
      target: { files: [new File([JSON.stringify(backup)], 'TEST-backup.json')], value: 'TEST-backup.json' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(imported).toBeDefined();
    await imported;
    expect((await listReaderProgress()).length, 'BackupControls must supply the checked-reader grader').toBe(
      backup.gradedReaders.length,
    );
    const { shadowing: _recordings, ...data } = backup;
    expect(await exportData()).toEqual(data);
    expect(await recordingBackup()).toEqual(backup.shadowing);
  } finally {
    timer.mockRestore();
    if (original) globalThis.FileReader = original;
    else Reflect.deleteProperty(globalThis, 'FileReader');
    probe.restore();
    translation.mockRestore();
  }
});

test('the committed starter JSON stays within the 100 KiB file budget', async () => {
  const file = Bun.file(new URL('../src/data/graded-readers/starter.json', import.meta.url));
  expect((await file.bytes()).byteLength).toBeLessThanOrEqual(100 * 1024);
});
