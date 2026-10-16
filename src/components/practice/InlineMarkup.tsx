/**
 * Renders the little Markdown the exercise prompts allow in a model's answer:
 * **bold** and `code` (French forms). Everything else is plain text, so nothing
 * the model writes can become markup. Owns this subset only.
 */
import { Fragment } from 'react';

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

export function InlineMarkup({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return (
            <code key={index} className="font-serif font-semibold">
              {part.slice(1, -1)}
            </code>
          );
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
