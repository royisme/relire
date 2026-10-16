/**
 * The French character bar: one round toggle fixed at the bottom of the screen
 * that opens a small grid of é è ê ë à â ç î ï ô ù û ü œ æ « » (and capitals
 * with Shift). A press inserts at the cursor of the input the sheet bound
 * and leaves focus where it was; it floats, so opening it moves nothing, and it
 * rides above the on-screen keyboard. Owns the grid and the insertion only; which
 * input is bound is decided by the sheet.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { TextInputElement } from './controls/types';

const CHARACTERS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'ù', 'û', 'ü', 'œ', 'æ', '«', '»'];

/** How far the on-screen keyboard covers the bottom of the layout viewport (0 without a keyboard). */
function subscribeViewport(listener: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', listener);
  viewport?.addEventListener('scroll', listener);
  return () => {
    viewport?.removeEventListener('resize', listener);
    viewport?.removeEventListener('scroll', listener);
  };
}
const keyboardHeight = () => {
  const viewport = window.visualViewport;
  return viewport ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)) : 0;
};

/** A bound input that is still on the page and can be typed in. */
const canInsert = (element: TextInputElement | null): element is TextInputElement =>
  Boolean(element?.isConnected && !element.readOnly && !element.disabled);

/** Inserts `text` at the cursor (or over the selection) and tells React the value changed. */
export function insertAtCursor(element: TextInputElement, text: string) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  element.setRangeText(text, start, end, 'end');
  // React listens for `input`; setting the value this way does not fire it by itself.
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function CharacterBar({ target }: { target: TextInputElement | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [capital, setCapital] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const lift = useSyncExternalStore(subscribeViewport, keyboardHeight, () => 0);
  const usable = canInsert(target);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const here = document.activeElement;
      if (here !== target && !root.current?.contains(here)) return;
      event.preventDefault();
      setOpen(false);
      target?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, target]);

  const insert = (character: string, shift: boolean) => {
    if (!target || !canInsert(target)) return;
    const upper = capital || shift;
    insertAtCursor(target, upper ? character.toUpperCase() : character);
    if (capital) setCapital(false);
    target.focus({ preventScroll: true });
  };

  // Pressing must not take focus from the input being typed in.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  const key = 'inline-flex h-10 w-10 items-center justify-center rounded-md font-serif text-lg select-none';

  return (
    <div
      ref={root}
      className="fixed right-4 z-40 flex flex-col items-end gap-2"
      style={{ bottom: `calc(1rem + ${lift}px + env(safe-area-inset-bottom, 0px))` }}
    >
      {open && (
        <div
          role="group"
          aria-label={t('practice.chars.label')}
          className="anim-fade w-[17.5rem] max-w-[calc(100vw-2rem)] rounded-lg border border-ink-200 bg-surface p-2 shadow-lg"
        >
          <div className="grid grid-cols-6 gap-1">
            {CHARACTERS.map((character) => (
              <button
                key={character}
                type="button"
                disabled={!usable}
                onMouseDown={keepFocus}
                onClick={(event) => insert(character, event.shiftKey)}
                className={cn(
                  key,
                  'cursor-pointer text-ink-900 hover:bg-ink-100 disabled:cursor-default disabled:opacity-50',
                )}
              >
                {capital ? character.toUpperCase() : character}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={capital}
              onMouseDown={keepFocus}
              onClick={() => setCapital((on) => !on)}
              className={cn(
                key,
                'cursor-pointer font-sans text-xs',
                capital ? 'bg-accent-100 font-medium text-accent-900' : 'text-ink-700 hover:bg-ink-100',
              )}
            >
              {t('practice.chars.shift')}
            </button>
          </div>
          <p className="px-1 pt-2 text-xs text-ink-500">
            {usable ? t('practice.chars.hint') : t('practice.chars.none')}
          </p>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('practice.chars.toggle')}
        title={t('practice.chars.toggle')}
        onMouseDown={keepFocus}
        onClick={() => setOpen((on) => !on)}
        className={cn(
          key,
          'cursor-pointer border border-ink-300 bg-surface text-ink-800 shadow-lg hover:bg-ink-100',
          open && 'bg-ink-100',
        )}
      >
        é
      </button>
    </div>
  );
}
