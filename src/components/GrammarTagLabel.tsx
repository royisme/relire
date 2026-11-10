/** Owns tag text and published-topic destinations; never loads topic content or reports index errors. */
import { useTranslation } from 'react-i18next';
import { useGrammarTagIndex } from '../hooks/useGrammarTagIndex';
import type { GrammarTag } from '../types/grammar';
import { grammarTagDestination } from '../utils/grammarTagDestination';
import { Link } from './shell/Link';

export function GrammarTagLabel({ tag }: { tag: GrammarTag }) {
  const { t } = useTranslation();
  const { index } = useGrammarTagIndex();
  const to = grammarTagDestination(index, tag);
  const label = t(`grammarTags.${tag}`);
  return to ? (
    <Link to={to} className="text-inherit hover:underline focus-visible:underline underline-offset-2">
      {label}
    </Link>
  ) : (
    <span>{label}</span>
  );
}
