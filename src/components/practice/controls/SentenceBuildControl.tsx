/**
 * SENTENCE_BUILD: the words of the sentence as tiles. Pressing a tile adds it
 * to the sentence under construction, pressing a placed word takes it back;
 * the built sentence is the answer (`singleAnswer`). A match with the
 * reference is graded at once; any other arrangement goes down the AI path as
 * an open answer. The tiles come from `options` when the item carries them,
 * otherwise from the reference sentence, shuffled the same way on every visit
 * so a stored draft still lines up with the bank.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { expectedAnswerText } from '../../../services/exercises/answer';
import { cn } from '../../../lib/utils';
import { ExpectedBeside } from './UnderlineInput';
import type { ExerciseControlProps } from './types';
import { InlineMarkup } from '../InlineMarkup';

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

interface Tile {
  id: string;
  word: string;
}

/** Reconstruct occurrence identities from a saved string; transfers keep these identities locally. */
function restoreTiles(text: string, tiles: Tile[]): Tile[] {
  const available = [...tiles];
  return wordsOf(text).map((word, at) => {
    const index = available.findIndex((tile) => tile.word === word);
    return index < 0 ? { id: `saved-${at}`, word } : available.splice(index, 1)[0];
  });
}

const placedStyle = 'min-h-9 max-sm:min-h-10 max-w-full break-words rounded-md px-2 font-serif text-base';
const bankStyle = 'min-h-9 max-sm:min-h-10 max-w-full break-words rounded-md px-3 font-sans text-sm';
const tileLine = 'col-start-1 row-start-1 flex flex-wrap items-center gap-0.5';

export function SentenceBuildControl({ item, onWord, answer, onChange, checked, disabled }: ExerciseControlProps) {
  const { t } = useTranslation();
  const tiles = shuffledTiles(item.options?.flatMap(wordsOf) ?? wordsOf(expectedAnswerText(item)), item.id).map(
    (word, at) => ({ id: String(at), word }),
  );
  // Only occurrence identities are local; the persisted answer remains a plain sentence.
  const [selection, setSelection] = useState(() => ({
    text: answer.singleAnswer,
    tiles: restoreTiles(answer.singleAnswer, tiles),
  }));
  let built = selection.tiles;
  if (selection.text !== answer.singleAnswer) {
    built = restoreTiles(answer.singleAnswer, tiles);
    setSelection({ text: answer.singleAnswer, tiles: built });
  }
  const bank = tiles.filter((tile) => !built.some((placed) => placed.id === tile.id));
  const buttons = useRef({ bank: new Map<string, HTMLButtonElement>(), built: new Map<string, HTMLButtonElement>() });
  const focusAfter = useRef<{ region: 'bank' | 'built'; id: string } | null>(null);
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (target) buttons.current[target.region].get(target.id)?.focus();
    focusAfter.current = null;
  }, [selection]);

  const transfer = (next: Tile[], region: 'bank' | 'built', target: Tile) => {
    const text = next.map((tile) => tile.word).join(' ');
    focusAfter.current = { region, id: target.id };
    setSelection({ text, tiles: next });
    onChange({ ...answer, singleAnswer: text });
  };
  const put = (tile: Tile, at: number) => {
    if (disabled) return;
    const remaining = bank.filter((word) => word.id !== tile.id);
    transfer([...built, tile], remaining.length ? 'bank' : 'built', remaining[at] ?? remaining.at(-1) ?? tile);
  };
  const take = (tile: Tile, at: number) => {
    if (disabled) return;
    const remaining = built.filter((word) => word.id !== tile.id);
    transfer(remaining, remaining.length ? 'built' : 'bank', remaining[at] ?? remaining.at(-1) ?? tile);
  };

  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">
        <InlineMarkup text={item.prompt} onWord={onWord} />
      </p>
      {item.secondaryPrompt && (
        <p className="break-words text-sm text-ink-500">
          <InlineMarkup text={item.secondaryPrompt} onWord={onWord} />
        </p>
      )}
      <div
        role="group"
        aria-label={t('practice.sentenceLabel', { number: item.itemNumber })}
        className="flex h-24 w-full max-w-xl flex-wrap content-start items-center gap-0.5 overflow-y-auto border-b-2 border-ink-300 pb-1"
      >
        {built.length === 0 && <span className="px-2 py-2 text-sm text-ink-400">{t('practice.sentenceEmpty')}</span>}
        {built.map((tile, at) => (
          <button
            key={tile.id}
            ref={(node) => {
              if (node) buttons.current.built.set(tile.id, node);
              else buttons.current.built.delete(tile.id);
            }}
            type="button"
            aria-disabled={disabled || undefined}
            aria-label={t('practice.removeWord', { word: tile.word })}
            onClick={() => take(tile, at)}
            className={cn(
              placedStyle,
              disabled ? 'cursor-default' : 'cursor-pointer hover:bg-ink-100',
              !checked && 'bg-accent-100 font-medium text-accent-900',
              checked?.correct && 'bg-ok-50 font-medium text-ok-800',
              checked && !checked.correct && 'bg-bad-50 font-medium text-bad-700 line-through',
            )}
          >
            {tile.word}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label={t('practice.tilesLabel', { number: item.itemNumber })}
        className="grid min-h-10 w-fit max-w-full rounded-md border border-ink-300 p-0.5"
      >
        {/* Keep the full bank's footprint while its visible subset shrinks. */}
        <div aria-hidden="true" className={cn(tileLine, 'invisible pointer-events-none')}>
          {tiles.map((tile) => (
            <span key={tile.id} className={bankStyle}>
              {tile.word}
            </span>
          ))}
        </div>
        <div className={tileLine}>
          {bank.map((tile, at) => (
            <button
              key={tile.id}
              ref={(node) => {
                if (node) buttons.current.bank.set(tile.id, node);
                else buttons.current.bank.delete(tile.id);
              }}
              type="button"
              aria-disabled={disabled || undefined}
              onClick={() => put(tile, at)}
              className={cn(
                bankStyle,
                disabled ? 'cursor-default text-ink-500' : 'cursor-pointer text-ink-700 hover:bg-ink-100',
              )}
            >
              {tile.word}
            </button>
          ))}
        </div>
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
