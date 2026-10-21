/** Attributed answer prose; caller mounts it only after a durable reveal or in an explicit detail sheet. */
import { useTranslation } from 'react-i18next';
import type { VocabularyJoined } from '../../services/vocabulary/queue';
export function VocabularyAnswer({ word, snapshot = false }: { word: VocabularyJoined; snapshot?: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const source = snapshot ? word.row?.bookSource : word.bookSource;
  return (
    <div className="space-y-6 break-words text-sm text-ink-800">
      {source && (
        <section className="space-y-3">
          {source.senses.map((sense, index) => (
            <div key={index} className="space-y-2">
              {sense.pos && <p className="text-xs text-ink-600">{sense.pos}</p>}
              <p>{sense.gloss[language]}</p>
              {sense.examples.map((example, i) => (
                <div key={i}>
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
        <section key={context.id} className="space-y-2 border-t border-ink-200 pt-4">
          <h3 className="font-serif text-lg font-semibold">{t('vocab.savedContext')}</h3>
          <p className="text-xs text-ink-600">
            {t('vocab.savedLanguage', { language: t(`vocab.language.${context.requestLanguage}`) })}
          </p>
          {context.source && <p className="text-xs text-ink-600">{context.source.title}</p>}
          {context.sentence && (
            <p lang="fr" className="font-serif text-lg">
              {context.sentence}
            </p>
          )}
          <p>
            {language === 'en' && context.analysis.translationEn
              ? context.analysis.translationEn
              : context.analysis.translation}
          </p>
          {context.analysis.partOfSpeech && <p className="text-xs text-ink-600">{context.analysis.partOfSpeech}</p>}
          {context.analysis.usageExamples?.map((example, index) => (
            <div key={index}>
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
