/** Static prop plumbing only: the floating pill and the touch sentence bar forward an explicit device source to
 * their Listen control (SpeakButton's existing `engine`), and stay on the selected engine without it. */
import { expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance, type TFunction } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import * as speak from '../src/components/ui/speak-button';
import { ReaderSentenceToolbar } from '../src/components/reader/ReaderSentenceToolbar';
import { SentenceBar } from '../src/components/reader/SentenceBar';
import en from '../src/i18n/locales/en.json';

test('the sentence toolbars forward an explicit device source to their Listen control, and none without it', async () => {
  const seen: Array<{ text: string; engine?: 'device' }> = [];
  // Spied (not mock.module'd) so the real control is back for every other suite in this process.
  const stub = (props: { text: string; engine?: 'device' }) => {
    seen.push({ text: props.text, engine: props.engine });
    return null;
  };
  const control = spyOn(speak, 'SpeakButton').mockImplementation(stub as unknown as typeof speak.SpeakButton);
  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: en } }, initAsync: false });
  const noop = () => undefined;
  const t = i18n.t as unknown as TFunction;

  const toolbar = (playbackEngine?: 'device') =>
    renderToStaticMarkup(
      <ReaderSentenceToolbar
        t={t}
        toolbar={{ id: '0-0', text: 'Un Deux.', top: 0, left: 0 }}
        cancelClear={noop}
        scheduleClear={noop}
        speechActive={false}
        onExplain={noop}
        onPractise={noop}
        cardBusy={false}
        practisedId={null}
        playbackEngine={playbackEngine}
      />,
    );
  toolbar('device');
  expect(seen.at(-1)).toEqual({ text: 'Un Deux.', engine: 'device' });
  toolbar();
  expect(seen.at(-1)).toEqual({ text: 'Un Deux.', engine: undefined });

  const bar = (playbackEngine?: 'device') =>
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <SentenceBar
          text="Un Deux."
          practiseBlocked={false}
          onExplain={noop}
          onPractise={noop}
          onDismiss={noop}
          playbackEngine={playbackEngine}
        />
      </I18nextProvider>,
    );
  bar('device');
  expect(seen.at(-1)).toEqual({ text: 'Un Deux.', engine: 'device' });
  bar();
  expect(seen.at(-1)).toEqual({ text: 'Un Deux.', engine: undefined });
  expect(control).toHaveBeenCalledTimes(4);
  control.mockRestore();
});
