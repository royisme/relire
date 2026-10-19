/**
 * The "Verb form" section of the word sheet: which verbs, tenses and persons write the clicked word
 * (`aller : présent, je` for `vais`, the tense and the person in French), one line per lemma: the pack's verbs
 * first, then the lexicon's other verbs when a content service is configured. Draws nothing, with no heading,
 * when the word is no verb form or the pack did not load (the Conjugation slot shows that error); a lexicon
 * failure shows its real text under the lines. The sheet settles the pack and the lexicon before drawing this
 * (useWordSheetPack), so it is in the entry's first frame. Loaded lazily with the pack, so neither the pack nor
 * the index is in the main bundle. Does not own the section frame's look (Section) or the matching
 * (grammarPack/reverse, lexicon/match).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGrammarPack } from '../../hooks/useGrammarPack';
import { lookupVerbForms } from '../../services/grammarPack/reverse';
import type { VerbFormMatch } from '../../services/lexicon/match';
import type { LexiconVerbLines } from '../../services/lexicon/verbs';
import { Section } from './Section';

export function VerbForms({ lookup, lexicon }: { lookup: string; lexicon: LexiconVerbLines }) {
  const { t } = useTranslation();
  const { pack } = useGrammarPack();
  const lines = useMemo(
    () => [
      ...(pack ? lookupVerbForms(pack, lookup) : []).map(({ verb, tenses, participles }) => ({
        infinitive: verb.infinitive,
        match: { tenses, participles },
      })),
      ...lexicon.lines,
    ],
    [pack, lookup, lexicon],
  );

  const line = (infinitive: string, { tenses, participles }: VerbFormMatch) =>
    t('wordModal.verbFormLine', {
      verb: infinitive,
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

  if (!lines.length && !lexicon.error) return null;
  return (
    <Section title={t('wordModal.verbForm')}>
      <ul className="space-y-1">
        {lines.map(({ infinitive, match }) => (
          <li key={infinitive} className="break-words text-sm text-ink-800">
            {line(infinitive, match)}
          </li>
        ))}
      </ul>
      {lexicon.error && (
        <p role="alert" className="break-words text-sm text-bad-700">
          {lexicon.error}
        </p>
      )}
    </Section>
  );
}
