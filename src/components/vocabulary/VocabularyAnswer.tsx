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
      {word.row?.contexts.map((context) => {
        const definition = context.definition;
        return (
          <section key={context.id} className="space-y-4 border-t border-ink-200 pt-6">
            <div className="space-y-1 text-xs text-ink-600">
              <p>{t('vocab.savedContext')}</p>
              {definition.kind === 'ai' && (
                <p>{t('vocab.savedLanguage', { language: t(`vocab.language.${context.requestLanguage}`) })}</p>
              )}
              {context.source && <p>{context.source.title}</p>}
            </div>
            <div className="space-y-1">
              <p className="text-2xl leading-snug text-ink-900">
                {definition.kind === 'reader'
                  ? definition.entry.gloss[language]
                  : language === 'en' && definition.analysis.translationEn
                    ? definition.analysis.translationEn
                    : definition.analysis.translation}
              </p>
              {definition.kind === 'ai' && definition.analysis.partOfSpeech && (
                <p className="text-xs text-ink-600">{definition.analysis.partOfSpeech}</p>
              )}
              {definition.kind === 'reader' && definition.entry.gender && (
                <p className="text-xs text-ink-600">
                  {definition.entry.gender === 'masculine'
                    ? t('practice.genderMasculine')
                    : t('practice.genderFeminine')}
                </p>
              )}
            </div>
            {context.sentence && (
              <p lang="fr" className="font-serif text-lg">
                {context.sentence}
              </p>
            )}
            {definition.kind === 'reader' && <p className="text-ink-600">{definition.sentenceTranslation[language]}</p>}
            {definition.kind === 'ai' &&
              definition.analysis.usageExamples?.map((example, index) => (
                <div key={index} className="space-y-1">
                  <p lang="fr" className="font-serif text-lg">
                    {example.fr}
                  </p>
                  <p className="text-ink-600">{language === 'en' && example.en ? example.en : example.zh}</p>
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
