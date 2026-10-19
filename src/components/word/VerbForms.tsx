/**
 * The "Verb form" section of the word sheet: which pack verbs, tenses and persons write the clicked word
 * (`aller: Present, I` for `vais`), one line per lemma. Draws nothing while the pack loads and nothing, with no
 * heading, when the word is no pack form; a load error shows its real text under the heading. Loaded lazily with
 * the pack, so neither the pack nor the index is in the main bundle. Does not own the section frame's look
 * (Section) or the matching (grammarPack/reverse).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrammarPack } from '../../hooks/useGrammarPack';
import { lookupVerbForms, type VerbFormGroup } from '../../services/grammarPack/reverse';
import { Section } from './Section';

export function VerbForms({ lookup }: { lookup: string }) {
  const { t } = useTranslation();
  const { status, pack, error } = useGrammarPack();
  const groups = useMemo(() => (pack ? lookupVerbForms(pack, lookup) : []), [pack, lookup]);

  const line = ({ verb, tenses, participles }: VerbFormGroup) =>
    t('wordModal.verbFormLine', {
      verb: verb.infinitive,
      forms: [
        ...tenses.map(({ tense, persons }) =>
          t('wordModal.verbFormTense', {
            tense: t(`conjugation.tenses.${tense}.name`),
            persons: persons.map((person) => t(`conjugation.persons.${person}`)).join(' / '),
          }),
        ),
        ...participles.map((key) => t(`conjugation.page.participle.${key}`)),
      ].join(t('common.listSeparator')),
    });

  if (status === 'error')
    return (
      <Section title={t('wordModal.verbForm')}>
        <p role="alert" className="break-words text-sm text-bad-700">
          {error}
        </p>
      </Section>
    );
  if (!groups.length) return null;
  return (
    <Section title={t('wordModal.verbForm')}>
      <ul className="space-y-1">
        {groups.map((group) => (
          <li key={group.verb.id} className="break-words text-sm text-ink-800">
            {line(group)}
          </li>
        ))}
      </ul>
    </Section>
  );
}
