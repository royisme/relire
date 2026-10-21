/** Attributed answer prose; caller mounts it only after a durable reveal or in an explicit detail sheet. */
import { useTranslation } from 'react-i18next';
import type { VocabularyJoined } from '../../services/vocabulary/queue';
export function VocabularyAnswer({ word, snapshot = false }: { word: VocabularyJoined; snapshot?: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const source = snapshot ? word.row?.bookSource : word.bookSource;
  return (
    <div className="space-y-8 break-words text-sm text-ink-800">
      {source && (
        <section className="space-y-6">
          {source.senses.map((sense, index) => (
            <div key={index} className="space-y-4">
              <div className="space-y-1">
                <p className="text-2xl leading-snug text-ink-900">{sense.gloss[language]}</p>
                {sense.pos && <p className="text-xs text-ink-600">{sense.pos}</p>}
              </div>
              {sense.examples.map((example, i) => (
                <div key={i} className="space-y-1">
                  <p lang="fr" className="font-serif text-lg">
                    {example.fr}
                  </p>
                  <p className="text-ink-600">{example[language]}</p>
                </div>
              ))}
            </div>
          ))}
          <p className="text-xs text-ink-600">{t('vocab.builtIn')}</p>
        </section>
      )}
      {word.row?.contexts.map((context) => (
        <section key={context.id} className="space-y-4 border-t border-ink-200 pt-6">
          <div className="space-y-1 text-xs text-ink-600">
            <p>{t('vocab.savedContext')}</p>
            <p>{t('vocab.savedLanguage', { language: t(`vocab.language.${context.requestLanguage}`) })}</p>
            {context.source && <p>{context.source.title}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-2xl leading-snug text-ink-900">
              {language === 'en' && context.analysis.translationEn
                ? context.analysis.translationEn
                : context.analysis.translation}
            </p>
            {context.analysis.partOfSpeech && <p className="text-xs text-ink-600">{context.analysis.partOfSpeech}</p>}
          </div>
          {context.sentence && (
            <p lang="fr" className="font-serif text-lg">
              {context.sentence}
            </p>
          )}
          {context.analysis.usageExamples?.map((example, index) => (
            <div key={index} className="space-y-1">
              <p lang="fr" className="font-serif text-lg">
                {example.fr}
              </p>
              <p className="text-ink-600">{language === 'en' && example.en ? example.en : example.zh}</p>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
