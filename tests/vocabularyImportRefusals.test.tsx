import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { VocabularyImportResult } from '../src/components/vocabulary/VocabularyImport';
import { parsePlainText } from '../src/services/vocabulary/import/plainText';
import { prepareVocabularyImport } from '../src/services/vocabulary/import/prepare';
import { importReason, type ImportReason } from '../src/services/vocabulary/import/refusal';

for (const language of ['en', 'zh'] as const) {
  test(`${language}: importer refusals translate in the UI, retain parameters and leave external errors alone`, async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: language,
      resources: { en: { translation: en }, zh: { translation: zh } },
      interpolation: { escapeValue: false },
    });
    const errors: ImportReason[] = [];
    for (const text of ['#separator:unsupported\na,b', '#guid column:0\na,b']) {
      try {
        parsePlainText(text);
      } catch (error) {
        errors.push(importReason(error));
      }
    }
    for (const text of [
      'chat,"cat',
      'chat,"cat"extra',
      'chat,&unknown;',
      'chat,&#0;',
      'chat,bad\u0000',
      'chat',
      'chat,',
      'chat,&lt;b&gt;markup&lt;/b&gt;',
    ]) {
      const result = prepareVocabularyImport(
        parsePlainText(text),
        { front: 0, back: 1, example: null },
        'TEST',
        'en',
        0,
      );
      errors.push(...result.rejected.map((row) => row.reason));
    }
    errors.push(
      ...prepareVocabularyImport(
        parsePlainText('chat,cat'),
        { front: 0, back: 0, example: null },
        'TEST',
        'en',
        0,
      ).rejected.map((row) => row.reason),
    );
    expect(errors).toHaveLength(11);
    for (const reason of errors) {
      expect(typeof reason).toBe('object');
      if (typeof reason === 'string') continue;
      const translated = i18n.t(reason.key, reason.params);
      expect(translated).not.toBe(reason.key);
      if (language === 'zh') expect(translated).not.toBe(i18n.t(reason.key, { ...reason.params, lng: 'en' }));
      const top = renderToString(
        <I18nextProvider i18n={i18n}>
          <VocabularyImportResult error={reason} result={null} ready={null} />
        </I18nextProvider>,
      );
      const row = renderToString(
        <I18nextProvider i18n={i18n}>
          <VocabularyImportResult
            error={null}
            result={{ imported: 0, merged: 0, rejected: [{ row: 7, reason }] }}
            ready={null}
          />
        </I18nextProvider>,
      );
      for (const html of [top, row]) {
        expect(html).toContain(renderToString(<>{translated}</>));
        expect(html).not.toContain('vocab.import.errors.');
      }
    }
    const external = importReason(new Error('TEST external decoder error'));
    expect(external).toBe('TEST external decoder error');
    expect(
      renderToString(
        <I18nextProvider i18n={i18n}>
          <VocabularyImportResult error={external} result={null} ready={null} />
        </I18nextProvider>,
      ),
    ).toContain('TEST external decoder error');
  });
}
