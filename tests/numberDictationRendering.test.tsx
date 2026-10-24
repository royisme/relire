/** DOM-free dictation rendering and check-transition speech contracts; playback is mocked, never synthesized. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { NumberDictationControl } from '../src/components/practice/controls/NumberDictationControl';
import { InlineMarkup } from '../src/components/practice/InlineMarkup';
import { SpeakButton } from '../src/components/ui/speak-button';
import { emptyAnswer } from '../src/services/exercises/answer';
import { prepareReaderDictation } from '../src/services/exercises/fromReader';
import type { CheckedResult, ExerciseItem } from '../src/types/exercises';
import * as settings from '../src/utils/appSettings';
import * as speech from '../src/utils/speech';
import en from '../src/i18n/locales/en.json';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerHookProbe } from './fixtures/readerHookProbe';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } }, initAsync: false });
const item = prepareReaderDictation({ reader: publishedReaderFixture(), language: 'en', t: i18n.t.bind(i18n) })[0]
  .items[0];
const plain = { ...item, meta: undefined };
const base = settings.getAppSettings();
let probe: ReturnType<typeof readerHookProbe>;
let undo: (() => void)[];
beforeEach(() => {
  probe = readerHookProbe();
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({ t: i18n.t.bind(i18n), i18n } as never);
  undo = [() => translation.mockRestore()];
});
afterEach(() => {
  probe.restore();
  for (const restore of undo.reverse()) restore();
});
const draw = (source: ExerciseItem, checked: CheckedResult | null = null) =>
  probe.render(() =>
    NumberDictationControl({
      item: source,
      type: 'NUMBER_DICTATION',
      answer: emptyAnswer(source),
      onChange: () => undefined,
      onWord: () => undefined,
      checked,
      disabled: checked !== null,
      registerInput: () => undefined,
    }),
  );

function elements(tree: React.ReactNode): React.ReactElement<{ children?: React.ReactNode }>[] {
  return React.Children.toArray(tree).flatMap((node) =>
    React.isValidElement<{ children?: React.ReactNode }>(node) ? [node, ...elements(node.props.children)] : [],
  );
}
function child<P>(tree: React.ReactNode, type: React.ElementType): React.ReactElement<P> {
  return elements(tree).find((node) => node.type === type) as React.ReactElement<P>;
}

test('reader translations keep InlineMarkup but no word lookup; ordinary dictation prompts keep lookup', () => {
  const marked = { ...item, prompt: '**This** is a `book`.' };
  const tree = draw(marked);
  expect(child<React.ComponentProps<typeof InlineMarkup>>(tree, InlineMarkup).props.onWord).toBeUndefined();
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('<strong>This</strong>');
  expect(html).toContain('>book</code>');
  expect(html).not.toContain('role="button"');
  expect(html).not.toContain(item.audioText!);
  const ordinary = draw({ ...plain, prompt: marked.prompt });
  expect(child<React.ComponentProps<typeof InlineMarkup>>(ordinary, InlineMarkup).props.onWord).toBeInstanceOf(
    Function,
  );
  expect(renderToStaticMarkup(ordinary)).toContain('role="button"');
});

test('Listen receives an explicit device engine only when the item declares it', () => {
  for (const source of [item, plain, { ...plain, meta: { playbackEngine: 'device' } }]) {
    const listen = child<React.ComponentProps<typeof SpeakButton>>(draw(source), SpeakButton).props;
    expect(listen.engine).toBe(source.meta?.playbackEngine === 'device' ? 'device' : undefined);
    expect(listen.text).toBe(item.audioText!);
    expect(listen.rate).toBe(base.practiceDictationSpeed);
    expect(listen.label).toBe(i18n.t('practice.listen'));
  }
});

for (const remote of [false, true]) {
  for (const kind of ['plain', 'reader', 'explicit-device']) {
    test(`after check: remote opt-in ${remote}, item ${kind}`, () => {
      const prefs = spyOn(settings, 'getAppSettings').mockReturnValue({
        ...base,
        practiceSpeakAfterCheck: true,
        practiceRemoteAutoSpeak: remote,
        practiceDictationSpeed: 0.5,
      });
      const speak = spyOn(speech, 'speakFrench').mockResolvedValue(undefined);
      undo.push(
        () => prefs.mockRestore(),
        () => speak.mockRestore(),
      );
      const device = kind !== 'plain';
      const source = kind === 'reader' ? item : device ? { ...plain, meta: { playbackEngine: 'device' } } : plain;
      draw(source);
      probe.effects();
      expect(speak).not.toHaveBeenCalled();
      const checked = { correct: true, strictAccents: true };
      draw(source, checked);
      probe.effects();
      expect(speak).toHaveBeenCalledTimes(1);
      expect(speak).toHaveBeenCalledWith(item.audioText!, {
        rate: 0.5,
        ...(device || !remote ? { engine: 'device' } : {}),
      });
      draw(source, checked);
      probe.effects();
      expect(speak).toHaveBeenCalledTimes(1);
    });
  }
}

for (const remote of [false, true]) {
  test(`master switch off stays silent even for explicit device items (remote ${remote})`, () => {
    const prefs = spyOn(settings, 'getAppSettings').mockReturnValue({
      ...base,
      practiceSpeakAfterCheck: false,
      practiceRemoteAutoSpeak: remote,
    });
    const speak = spyOn(speech, 'speakFrench').mockResolvedValue(undefined);
    undo.push(
      () => prefs.mockRestore(),
      () => speak.mockRestore(),
    );
    draw(item);
    probe.effects();
    draw(item, { correct: false, strictAccents: true });
    probe.effects();
    expect(speak).not.toHaveBeenCalled();
  });
}

test('mounting an already checked reader item stays silent', () => {
  const prefs = spyOn(settings, 'getAppSettings').mockReturnValue({ ...base, practiceSpeakAfterCheck: true });
  const speak = spyOn(speech, 'speakFrench').mockResolvedValue(undefined);
  undo.push(
    () => prefs.mockRestore(),
    () => speak.mockRestore(),
  );
  draw(item, { correct: true, strictAccents: true });
  probe.effects();
  expect(speak).not.toHaveBeenCalled();
});
