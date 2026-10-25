/** The About page always names the Morphalou source and links the local notice and licence copies that ship with the app; only the service paragraphs depend on a configured service. */
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '../src/i18n/locales/en.json';
import { AboutSection } from '../src/components/settings/AboutSection';
import { freshSettingsStorage, restoreSettingsStorage, serviceOff, serviceOn } from './fixtures/contentServiceSettings';

const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  initAsync: false,
  interpolation: { escapeValue: false },
});
const render = () =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <AboutSection />
    </I18nextProvider>,
  );

beforeEach(() => {
  freshSettingsStorage();
  serviceOn('http://content.test');
});
afterEach(() => {
  restoreSettingsStorage();
});

test('the entry names the data, its maintainer, licence, source link and the local notice and licence files', () => {
  const html = render();
  expect(html).toContain('Morphalou 3.1');
  expect(html).toContain('ATILF (CNRS / Université de Lorraine)');
  expect(html).toContain('LGPL-LR');
  expect(html).toContain('href="http://www.cnrtl.fr/lexiques/morphalou/"');
  expect(html).toContain('data/lexicon/NOTICE.md');
  expect(html).toContain('data/lexicon/LGPL-LR.txt');
  expect(html).toContain('from a content service');
});

test('without a content service the Morphalou entry and the local links stay; the service paragraph goes', () => {
  serviceOff();
  const html = render();
  expect(html).toContain('Morphalou');
  expect(html).toContain('data/lexicon/NOTICE.md');
  expect(html).toContain('data/lexicon/LGPL-LR.txt');
  expect(html).not.toContain('from a content service');
  expect(html).toContain('github.com/royisme/relire');
});
