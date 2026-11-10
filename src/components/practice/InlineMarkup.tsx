/**
 * Renders the little Markdown the exercise prompts allow in a model's answer:
 * **bold** and `code` (French forms). Everything else is plain text, so nothing
 * the model writes can become markup. Owns this subset only.
 */
import { Fragment } from 'react';
import { LookupText } from '../reader/LookupText';

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

export function InlineMarkup({ text, onWord }: { text: string; onWord?: (word: string, sentence: string) => void }) {
  const render = (source: string) =>
    onWord ? <LookupText text={source} onWord={(word) => onWord(word, text)} /> : source;
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={index}>{render(part.slice(2, -2))}</strong>;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return (
            <code key={index} className="font-serif font-semibold">
              {render(part.slice(1, -1))}
            </code>
          );
        return <Fragment key={index}>{render(part)}</Fragment>;
      })}
    </>
  );
}
