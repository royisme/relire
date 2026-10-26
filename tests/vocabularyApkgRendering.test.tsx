/** Static markup only: no browser or simulated DOM, and no real Anki export. */
import { expect, spyOn, test } from 'bun:test';
import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { VocabularyImport, VocabularyImportResult } from '../src/components/vocabulary/VocabularyImport';
import { Dialog, DialogContent } from '../src/components/ui/dialog';
import { readApkg } from '../src/services/vocabulary/import/apkg';
import { parsePlainText } from '../src/services/vocabulary/import/plainText';
import { prepareVocabularyImport } from '../src/services/vocabulary/import/prepare';
import type { ApkgNoteType } from '../src/services/vocabulary/import/apkg';
import type { PlainTextImport } from '../src/services/vocabulary/import/plainText';
import { fixtureCollection, fixtureNotes, fixturePackage } from './fixtures/apkg';

const resources = { en: { translation: en }, zh: { translation: zh } };
// The state spy needs the module object and the real hook, not the live named binding the component calls.
const react = await import('react');
const realUseState = react.useState;

for (const language of ['en', 'zh'] as const) {
  test(`${language}: the note-type picker appears only for a package, with the chosen type's count and field names`, async () => {
    const instance = i18next.createInstance();
    await instance.init({ lng: language, resources, interpolation: { escapeValue: false } });
    const types = await readApkg(fixturePackage(fixtureCollection(11)));
    const text = parsePlainText('chat\tcat');
    const separator = instance.t('vocab.import.separator', { separator: instance.t('vocab.import.separators.tab') });
    // The shared Dialog portals client-only, so its content is rendered here, with the file choice injected through
    // the dialog's own null state slots in order: parsed, the pipeline, the note types, the note-type id, error, result.
    const render = (chosen: { text?: PlainTextImport; types?: ApkgNoteType[]; value?: string }) => {
      let nulls = 0;
      const state = spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
        const pair = realUseState(initial);
        if (initial !== null) return pair;
        nulls += 1;
        if (nulls === 1 && chosen.text) return [chosen.text, pair[1]];
        if (nulls === 3 && chosen.types) return [chosen.types, pair[1]];
        if (nulls === 4 && chosen.value) return [chosen.value, pair[1]];
        return pair;
      }) as typeof realUseState);
      try {
        function ImportDialog() {
          const root = VocabularyImport() as ReactElement<{ children: ReactNode }>;
          const content = Children.toArray(root.props.children).find(
            (child) => isValidElement(child) && child.type === DialogContent,
          ) as ReactElement<{ children: ReactNode }>;
          return <Dialog.Root open>{content.props.children}</Dialog.Root>;
        }
        return renderToStaticMarkup(
          <I18nextProvider i18n={instance}>
            <ImportDialog />
          </I18nextProvider>,
        );
      } finally {
        state.mockRestore();
      }
    };
    // Before any file is chosen: no label, no select, no placeholder, no separator.
    const empty = render({});
    expect(empty).not.toContain(instance.t('vocab.import.apkg.noteType'));
    expect(empty).not.toContain('import-notetype');
    expect(empty).not.toContain(instance.t('vocab.import.apkg.chooseType'));
    expect(empty).not.toContain(instance.t('vocab.import.apkg.contentOnly'));
    expect(empty).not.toContain(separator);
    // A chosen text file: still no picker, and the separator sentence takes that place.
    const plain = render({ text });
    expect(plain).not.toContain(instance.t('vocab.import.apkg.noteType'));
    expect(plain).not.toContain('import-notetype');
    expect(plain).not.toContain(instance.t('vocab.import.apkg.chooseType'));
    expect(plain).not.toContain(instance.t('vocab.import.apkg.contentOnly'));
    expect(plain).toContain(separator);
    // A package: the row with its label and options, the selected type's count and field names, and the
    // content-only sentence, in the slot the separator sentence does not take.
    const apkg = render({ types, value: String(types[0].id) });
    expect(apkg).toContain(instance.t('vocab.import.apkg.noteType'));
    expect(apkg).toContain('aria-labelledby="import-notetype"');
    expect(apkg).toContain(
      instance.t('vocab.import.apkg.typeOption', {
        name: types[0].name,
        notes: 2,
        fields: 'Front, Back, Example',
      }),
    );
    expect(apkg).toContain(instance.t('vocab.import.apkg.contentOnly'));
    expect(apkg).not.toContain(separator);
    expect(apkg).not.toContain('vocab.import.');
    expect(apkg.match(/<button\b[^>]*aria-labelledby="import-notetype"[^>]*>/)![0]).not.toMatch(/\sdisabled=""/);
    const wrapper = apkg.match(/<div\b[^>]*><span id="import-notetype">/)![0];
    expect(wrapper).toContain('space-y-1');
    expect(wrapper).not.toContain('h-32');
    expect(wrapper).not.toContain('h-40');
    expect(wrapper).not.toContain('overflow-auto');
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
    const slot = html.match(/<div\b[^>]*role="status"[^>]*>/)![0];
    expect(slot).toContain('min-h-12');
    expect(slot).not.toContain('h-32');
    expect(slot).not.toContain('h-40');
    expect(slot).not.toContain('overflow-auto');
    expect(html.match(/<ul\b[^>]*>/)![0]).toContain('max-h-40 overflow-auto');
    expect(html.match(/overflow-auto/g)).toHaveLength(1);
    const reason = instance.t('vocab.import.errors.unsupportedEntity', { entity: '&unknown;' });
    expect(html).toContain(reason.replace('&unknown;', '&amp;unknown;'));
    expect(html).toContain(instance.t('vocab.import.result', { imported: 1, merged: 0, rejected: 1 }));
    expect(html).toContain(
      instance.t('vocab.import.rejectedRow', { row: 2, reason }).replace('&unknown;', '&amp;unknown;'),
    );
  });
}
