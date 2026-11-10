/** A qualified ending tendency under a noun's meaning, settled before the entry mounts; never asserts an unknown noun's gender. */
import { useTranslation } from 'react-i18next';
import type { NounPackResult } from '../../hooks/useWordSheetPack';
import { matchNounGender } from '../../services/nounGender/match';
import { tendencyPercent } from '../../types/nounGenderDrill';

export function NounGenderHint({ lemma, result }: { lemma: string; result: NounPackResult }) {
  const { t } = useTranslation();
  if (result.error !== undefined)
    return (
      <p role="alert" className="mt-1 break-words text-sm text-bad-700">
        {result.error}
      </p>
    );
  const match = matchNounGender(result.pack, lemma);
  if (!match) return null;
  return (
    <p className="mt-1 break-words text-sm text-ink-600">
      {t('nounGender.ruleLine', {
        rule: t(`nounGender.rules.${match.rule.id}`),
        percent: tendencyPercent((100 * match.rule.dictionary.agree) / match.rule.dictionary.n),
        n: match.rule.dictionary.n,
      })}
      {match.exception && <> {t('nounGender.exception')}</>}
    </p>
  );
}
