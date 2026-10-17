/**
 * SENTENCE_BUILD: the words of the sentence as tiles. Pressing a tile adds it
 * to the sentence under construction, pressing a placed word takes it back;
 * the built sentence is the answer (`singleAnswer`). A match with the
 * reference is graded at once; any other arrangement goes down the AI path as
 * an open answer. The tiles come from `options` when the item carries them,
 * otherwise from the reference sentence, shuffled the same way on every visit
 * so a stored draft still lines up with the bank.
 */
import { useTranslation } from 'react-i18next';
import { expectedAnswerText } from '../../../services/exercises/answer';
import { cn } from '../../../lib/utils';
import { ExpectedBeside } from './UnderlineInput';
import type { ExerciseControlProps } from './types';

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

/** A fixed shuffle for one item, so the bank does not spell out the answer and reloads keep it stable. */
function shuffledTiles(tiles: string[], id: string): string[] {
  let seed = 0;
  for (const char of id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const out = [...tiles];
  for (let at = out.length - 1; at > 0; at--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swap = seed % (at + 1);
    [out[at], out[swap]] = [out[swap], out[at]];
  }
  return out;
}

export function SentenceBuildControl({ item, answer, onChange, checked, disabled }: ExerciseControlProps) {
  const { t } = useTranslation();
  const tiles = shuffledTiles(item.options ?? wordsOf(expectedAnswerText(item)), item.id);
  const built = wordsOf(answer.singleAnswer);
  const bank = [...tiles];
  for (const word of built) {
    const at = bank.indexOf(word);
    if (at >= 0) bank.splice(at, 1);
  }

  const put = (word: string) => {
    if (!disabled) onChange({ ...answer, singleAnswer: [...built, word].join(' ') });
  };
  const take = (at: number) => {
    if (!disabled) onChange({ ...answer, singleAnswer: built.filter((_, word) => word !== at).join(' ') });
  };

  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">{item.prompt}</p>
      {item.secondaryPrompt && <p className="break-words text-sm text-ink-500">{item.secondaryPrompt}</p>}
      <div
        role="group"
        aria-label={t('practice.sentenceLabel', { number: item.itemNumber })}
        className="flex min-h-10 w-full max-w-xl flex-wrap items-center gap-0.5 border-b-2 border-ink-300 pb-1"
      >
        {built.length === 0 && <span className="px-2 py-2 text-sm text-ink-400">{t('practice.sentenceEmpty')}</span>}
        {built.map((word, at) => (
          <button
            key={`${word}-${at}`}
            type="button"
            aria-disabled={disabled || undefined}
            aria-label={t('practice.removeWord', { word })}
            onClick={() => take(at)}
            className={cn(
              'min-h-9 max-sm:min-h-10 max-w-full break-words rounded-md px-2 font-serif text-base',
              disabled ? 'cursor-default' : 'cursor-pointer hover:bg-ink-100',
              !checked && 'bg-accent-100 font-medium text-accent-900',
              checked?.correct && 'bg-ok-50 font-medium text-ok-800',
              checked && !checked.correct && 'bg-bad-50 font-medium text-bad-700 line-through',
            )}
          >
            {word}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label={t('practice.tilesLabel', { number: item.itemNumber })}
        className="inline-flex min-h-10 max-w-full flex-wrap items-center gap-0.5 rounded-md border border-ink-300 p-0.5"
      >
        {bank.map((word, at) => (
          <button
            key={`${word}-${at}`}
            type="button"
            aria-disabled={disabled || undefined}
            onClick={() => put(word)}
            className={cn(
              'min-h-9 max-sm:min-h-10 max-w-full break-words rounded-md px-3 font-sans text-sm',
              disabled ? 'cursor-default text-ink-500' : 'cursor-pointer text-ink-700 hover:bg-ink-100',
            )}
          >
            {word}
          </button>
        ))}
      </div>
      {checked && !checked.correct && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-ink-600">{t('practice.sampleAnswer')}</span>
          <ExpectedBeside text={expectedAnswerText(item)} />
        </p>
      )}
    </div>
  );
}
