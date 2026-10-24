/** The About page names the Morphalou source only when a content service is configured (otherwise no Morphalou data is used). */
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

test('with a content service the entry names the data, its maintainer, licence and source link', () => {
  const html = render();
  expect(html).toContain('Morphalou 3.1');
  expect(html).toContain('ATILF (CNRS / Université de Lorraine)');
  expect(html).toContain('LGPL-LR');
  expect(html).toContain('href="http://www.cnrtl.fr/lexiques/morphalou/"');
  expect(html).toContain('/blob/main/worker/NOTICE.md');
});

test('without a content service no Morphalou entry is drawn', () => {
  serviceOff();
  const html = render();
  expect(html).not.toContain('Morphalou');
  expect(html).not.toContain('NOTICE.md');
  expect(html).toContain('github.com/royisme/relire');
});
