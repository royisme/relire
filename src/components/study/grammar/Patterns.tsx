/**
 * The Conjugation page's three fixed sentence-pattern rows and two selectors.
 * Owns selection and bounded layout, not French rules, cell status or requests.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cellParts, takesOn, type SubjectChoice } from '../../../services/conjugation/cellParts';
import {
  PATTERN_NAMES,
  estCeQue,
  inversion,
  negation,
  patternNote,
  type PatternName,
} from '../../../services/conjugation/patterns';
import type { VerifiedVerb } from '../../../services/conjugation/verify';
import { FINITE_PERSONS, IMPERATIVE_PERSONS, TENSES, type Person, type Tense } from '../../../types/grammarPack';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

const PATTERNS: Record<PatternName, typeof negation> = { negation, estCeQue, inversion };

export function Patterns({ verb }: { verb: VerifiedVerb }) {
  const { t } = useTranslation();
  const persons = (tense: Tense) =>
    (tense === 'imperatif' ? IMPERATIVE_PERSONS : FINITE_PERSONS).filter((person) => verb.tenses[tense][person]);
  // `on` is one more subject next to the third person singular; the imperative has no subject.
  const choices = (tense: Tense): SubjectChoice[] =>
    tense !== 'imperatif' && takesOn(verb)
      ? persons(tense).flatMap((person) => (person === '3sg' ? [person, 'on' as const] : [person]))
      : persons(tense);
  const [tense, setTense] = useState<Tense>('present');
  const [subject, setSubject] = useState<SubjectChoice>(() => choices('present')[0]);
  const person: Person = subject === 'on' ? '3sg' : subject;
  const parts = cellParts(verb, tense, subject);
  const status = verb.tenses[tense][person]!.status;
  const tenseItems = TENSES.filter((key) => persons(key).length).map((key) => ({
    value: key,
    label: t(`conjugation.tenses.${key}.name`),
  }));
  const personItems = choices(tense).map((key) => ({
    value: key,
    label: t(
      key === 'on'
        ? 'conjugation.page.patterns.on'
        : verb.defective === 'impersonal'
          ? 'conjugation.page.patterns.impersonal'
          : `conjugation.persons.${key}`,
    ),
  }));
  return (
    <section aria-label={t('conjugation.page.patterns.title')} className="border-t border-ink-200 py-5">
      <h3 className="font-serif text-lg font-semibold text-ink-900">{t('conjugation.page.patterns.title')}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label id="patterns-tense-label" className="mb-1 block text-sm text-ink-700">
            {t('conjugation.page.patterns.tense')}
          </label>
          <Select
            items={tenseItems}
            value={tense}
            onValueChange={(value) => {
              if (!value) return;
              setTense(value);
              if (!choices(value).includes(subject)) setSubject(persons(value)[0]);
            }}
          >
            <SelectTrigger aria-labelledby="patterns-tense-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tenseItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <label id="patterns-person-label" className="mb-1 block text-sm text-ink-700">
            {t('conjugation.page.patterns.person')}
          </label>
          <Select
            items={personItems}
            value={subject}
            onValueChange={(value) => {
              if (value) setSubject(value);
            }}
          >
            <SelectTrigger aria-labelledby="patterns-person-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {personItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-ink-200" aria-live="polite">
        {PATTERN_NAMES.map((name) => {
          const sentence = PATTERNS[name](parts);
          const reason = patternNote(name, tense, person);
          return (
            // Exactly a two-line sentence plus the note line, so a row never changes height with the selection:
            // py-3 (24) + label 20 + gap 4 + 2 x 28 + note gap 4 + 16 = 124px, plus the 1px divider.
            <div key={name} className="h-[125px] overflow-y-auto py-3">
              <dt className="text-sm leading-5 text-ink-600">{t(`conjugation.page.patterns.${name}`)}</dt>
              <dd className="mt-1 break-words">
                {sentence !== undefined ? (
                  <>
                    <p lang="fr" className="font-serif text-lg leading-7 text-ink-900">
                      {sentence}
                    </p>
                    {status !== 'reviewed' && status !== 'match' && (
                      <p className="mt-1 text-xs leading-4 text-ink-500">
                        {t(`conjugation.page.patterns.${status === 'differs' ? 'differs' : 'aiOnly'}`)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm leading-5 text-ink-500">
                    {t('conjugation.page.patterns.unavailable', { reason: t(`conjugation.page.patterns.${reason}`) })}
                  </p>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
