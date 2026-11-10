/** Clickable source spelling. Decorations never become lookup, accessible or copied text. */
import React from 'react';
import type { PronunciationLayers, PronunciationWord } from '../../types/pronunciation';
import type { ReaderWordToken } from '../../utils/readerTokens';
import { graphemes } from '../../utils/readerTokens';

interface Props {
  token: ReaderWordToken;
  annotation?: PronunciationWord;
  layers: PronunciationLayers;
  activeWord: string | null;
  onClick: (word: string) => void;
}

export function ReaderWord({ token, annotation, layers, activeWord, onClick }: Props) {
  const marked = annotation?.status === 'resolved';
  const selected = activeWord?.toLowerCase() === token.lookup.toLowerCase();
  const activate = () => onClick(token.lookup);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={token.text}
      data-reader-word={token.ordinal}
      onClick={(event) => {
        event.stopPropagation();
        activate();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      }}
      className={`reader-word cursor-pointer rounded-sm hover:bg-accent-100 hover:underline decoration-accent-600 underline-offset-4 ${selected ? 'bg-accent-200 text-ink-950' : ''}`}
    >
      {marked
        ? graphemes(token.text).map((glyph, index) => (
            <React.Fragment key={index}>
              {annotation.boundaries.includes(index) && (
                <span
                  aria-hidden="true"
                  className={`pronunciation-slash ${layers.syllables ? '' : 'pronunciation-hidden'}`}
                />
              )}
              <span
                data-grapheme={index}
                className={
                  layers.silent && annotation.silent.some((span) => index >= span.start && index < span.end)
                    ? 'text-ink-500'
                    : undefined
                }
              >
                {glyph}
              </span>
            </React.Fragment>
          ))
        : token.text}
    </span>
  );
}
