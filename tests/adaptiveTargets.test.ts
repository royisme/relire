/** Locale sentence interpolation and list slots, without a rich-text parser. */
import { expect, test } from 'bun:test';
import i18next from 'i18next';
import { adaptiveTargetParts, TARGETS_MARKER } from '../src/components/progress/adaptiveTargets';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

for (const language of ['en', 'zh', 'en-GB', 'zh-CN']) {
  test(`${language} keeps the sentence and locale conjunctions around individual tag slots`, async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: language, resources: { en: { translation: en }, zh: { translation: zh } } });
    const tags = ['articles', 'present', 'negation'] as const;
    for (const count of [1, 2, 3]) {
      const labels = tags.slice(0, count).map((tag) => i18n.t(`grammarTags.${tag}`));
      const parts = adaptiveTargetParts(i18n.t('adaptive.targets', { tags: TARGETS_MARKER }), labels, language);
      expect(parts.filter((part) => part.type === 'tag')).toEqual(labels.map((_, index) => ({ type: 'tag', index })));
      expect(parts.map((part) => (part.type === 'tag' ? labels[part.index] : part.value)).join('')).toBe(
        i18n.t('adaptive.targets', {
          tags: new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(labels),
        }),
      );
    }
    expect(adaptiveTargetParts(`BEFORE ${TARGETS_MARKER} AFTER`, ['TEST', 'TEST'], language).at(-1)).toEqual({
      type: 'text',
      value: ' AFTER',
    });
  });
}
