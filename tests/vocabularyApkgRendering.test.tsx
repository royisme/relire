/** Static markup only: no browser or simulated DOM, and no real Anki export. */
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { VocabularyImportNoteTypes, VocabularyImportResult } from '../src/components/vocabulary/VocabularyImport';
import { readApkg } from '../src/services/vocabulary/import/apkg';
import { prepareVocabularyImport } from '../src/services/vocabulary/import/prepare';
import { fixtureCollection, fixtureNotes, fixturePackage } from './fixtures/apkg';

const resources = { en: { translation: en }, zh: { translation: zh } };
for (const language of ['en', 'zh'] as const) {
  test(`${language}: package picker retains its slot and exposes the selected note type, count and field names`, async () => {
    const instance = i18next.createInstance();
    await instance.init({ lng: language, resources, interpolation: { escapeValue: false } });
    const types = await readApkg(fixturePackage(fixtureCollection(11)));
    for (const state of [
      { types: null, value: null },
      { types, value: String(types[0].id) },
    ]) {
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={instance}>
          <VocabularyImportNoteTypes {...state} busy={false} separator="TEST separator" onSelect={() => {}} />
        </I18nextProvider>,
      );
      expect(html).toContain('h-32');
      expect(html).toContain('aria-labelledby="import-notetype"');
      expect(html).not.toContain('vocab.import.');
      if (state.types) {
        expect(html).toContain(
          instance.t('vocab.import.apkg.typeOption', {
            name: types[0].name,
            notes: 2,
            fields: 'Front, Back, Example',
          }),
        );
      }
      if (!state.types) expect(html).toContain('disabled');
    }
  });

  test(`${language}: the same result slot announces package counts, refused position and actual preparation reason`, async () => {
    const instance = i18next.createInstance();
    await instance.init({ lng: language, resources, interpolation: { escapeValue: false } });
    const types = await readApkg(
      fixturePackage(
        fixtureCollection(11, [
          fixtureNotes[0],
          { ...fixtureNotes[1], fields: ['chat', '&unknown;', 'Le chat dort.'] },
        ]),
      ),
    );
    const batch = prepareVocabularyImport(types[0].parsed, { front: 0, back: 1, example: null }, 'unused', language, 0);
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={instance}>
        <VocabularyImportResult
          error={null}
          ready={null}
          result={{ imported: 1, merged: 0, rejected: batch.rejected }}
        />
      </I18nextProvider>,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('h-32');
    const reason = instance.t('vocab.import.errors.unsupportedEntity', { entity: '&unknown;' });
    expect(html).toContain(reason.replace('&unknown;', '&amp;unknown;'));
    expect(html).toContain(instance.t('vocab.import.result', { imported: 1, merged: 0, rejected: 1 }));
    expect(html).toContain(
      instance.t('vocab.import.rejectedRow', { row: 2, reason }).replace('&unknown;', '&amp;unknown;'),
    );
  });
}
