/**
 * The "Verb form" section of the word sheet: which pack verbs, tenses and persons write the clicked word
 * (`aller : présent, je` for `vais`, the tense and the person in French), one line per lemma. Draws nothing, with no
 * heading, when the word is no pack form or the pack did not load (the Conjugation slot shows that error). The
 * sheet settles the pack before drawing this (useWordSheetPack), so it is in the entry's first frame. Loaded
 * lazily with the pack, so neither the pack nor the index is in the main bundle. Does not own the section frame's look
 * (Section) or the matching (grammarPack/reverse).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrammarPack } from '../../hooks/useGrammarPack';
import { lookupVerbForms, type VerbFormGroup } from '../../services/grammarPack/reverse';
import { Section } from './Section';

export function VerbForms({ lookup }: { lookup: string }) {
  const { t } = useTranslation();
  const { pack } = useGrammarPack();
  const groups = useMemo(() => (pack ? lookupVerbForms(pack, lookup) : []), [pack, lookup]);

  const line = ({ verb, tenses, participles }: VerbFormGroup) =>
    t('wordModal.verbFormLine', {
      verb: verb.infinitive,
      forms: [
        ...tenses.map(({ tense, persons }) =>
          t('wordModal.verbFormTense', {
            tense: t(`conjugation.tenseFr.${tense}`),
            persons: persons.map((person) => t(`conjugation.pronouns.${person}`)).join(' / '),
          }),
        ),
        ...participles.map((key) => t(`conjugation.page.participle.${key}`)),
        // A plain semicolon, not the locale's list separator: the line stays French punctuation in both languages.
      ].join('; '),
    });

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
