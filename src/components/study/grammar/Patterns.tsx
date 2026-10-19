/**
 * The Conjugation page's three fixed sentence-pattern rows and two selectors.
 * Owns selection and bounded layout, not French rules, cell status or requests.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cellParts } from '../../../services/conjugation/cellParts';
import { estCeQue, inversion, negation } from '../../../services/conjugation/patterns';
import type { VerifiedVerb } from '../../../services/conjugation/verify';
import { FINITE_PERSONS, IMPERATIVE_PERSONS, TENSES, type Person, type Tense } from '../../../types/grammarPack';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

const PATTERNS = { negation, estCeQue, inversion };

export function Patterns({ verb }: { verb: VerifiedVerb }) {
  const { t } = useTranslation();
  const persons = (tense: Tense) =>
    (tense === 'imperatif' ? IMPERATIVE_PERSONS : FINITE_PERSONS).filter((person) => verb.tenses[tense][person]);
  const [tense, setTense] = useState<Tense>('present');
  const [person, setPerson] = useState<Person>(() => persons('present')[0]);
  const parts = cellParts(verb, tense, person);
  const status = verb.tenses[tense][person]!.status;
  const tenseItems = TENSES.filter((key) => persons(key).length).map((key) => ({
    value: key,
    label: t(`conjugation.tenses.${key}.name`),
  }));
  const personItems = persons(tense).map((key) => ({
    value: key,
    label: t(verb.defective === 'impersonal' ? 'conjugation.page.patterns.impersonal' : `conjugation.persons.${key}`),
  }));
  return (
    <section aria-label={t('conjugation.page.patterns.title')} className="min-h-[40rem] border-t border-ink-200 py-5">
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
              if (!persons(value).includes(person)) setPerson(persons(value)[0]);
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
            value={person}
            onValueChange={(value) => {
              if (value) setPerson(value);
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
        {Object.entries(PATTERNS).map(([name, make]) => {
          const sentence = make(parts);
          const reason =
            name !== 'negation' && (tense === 'subjonctif' || tense === 'imperatif')
              ? 'noQuestions'
              : name === 'inversion' && person === '1sg'
                ? 'noJe'
                : 'notCovered';
          return (
            <div key={name} className="h-40 overflow-y-auto py-3">
              <dt className="text-sm text-ink-600">{t(`conjugation.page.patterns.${name}`)}</dt>
              <dd className="mt-1 break-words">
                {sentence !== undefined ? (
                  <>
                    <p lang="fr" className="font-serif text-lg text-ink-900">
                      {sentence}
                    </p>
                    {status !== 'reviewed' && status !== 'match' && (
                      <p className="mt-1 text-xs text-ink-500">
                        {t(`conjugation.page.patterns.${status === 'differs' ? 'differs' : 'aiOnly'}`)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-500">
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
