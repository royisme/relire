/**
 * The result of one verb: the header (infinitive, auxiliary, rule caption, status, the practise button), one
 * section per tense in order, then the participles. Owns that composition and the status wording keys. Does not own the request, the
 * input, or the per-tense and participle layout (TenseSection, Participles).
 */
import { useTranslation } from 'react-i18next';
import type { ConjugationResult as Result } from '../../../services/conjugation/resolve';
import { TENSES } from '../../../types/grammarPack';
import { Participles } from './Participles';
import { PractiseVerb } from './PractiseVerb';
import { TenseSection } from './TenseSection';

export function ConjugationResult({ result: { verb, examples } }: { result: Result }) {
  const { t } = useTranslation();
  return (
    <article aria-label={verb.infinitive}>
      <header className="space-y-1 pb-5">
        <h3 className="break-words font-serif text-2xl font-semibold text-ink-900">{verb.infinitive}</h3>
        <p className="text-sm text-ink-700">{t(`conjugation.page.auxiliary.${verb.aux}`)}</p>
        {verb.rule && verb.rule !== 'irregular' && (
          <p className="break-words text-sm text-ink-700">{t(`conjugation.rules.${verb.rule}`)}</p>
        )}
        <p className="break-words text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{t(`conjugation.page.status.${verb.status}.label`)}</span>{' '}
          {t(`conjugation.page.status.${verb.status}.note`)}
        </p>
        <PractiseVerb key={verb.infinitive} verb={verb} />
      </header>
      {TENSES.filter((tense) => Object.keys(verb.tenses[tense]).length > 0).map((tense) => (
        <TenseSection key={tense} tense={tense} verb={verb} example={examples?.[tense]} />
      ))}
      <Participles participles={verb.participles} />
    </article>
  );
}
