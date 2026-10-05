import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Languages } from 'lucide-react';
import { LANGUAGES, setAppLanguage } from '../i18n';
import { Button } from './ui/button';

/** One icon button; opens a short list of interface languages. */
export const LanguageSwitcher: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = i18n.language === 'zh' ? 'zh' : 'en';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.language')}
        title={t('nav.language')}
      >
        <Languages className="w-5 h-5" />
      </Button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full mt-1 z-40 min-w-40 rounded-lg border border-ink-200 bg-white py-1 shadow-lg anim-fade"
        >
          {LANGUAGES.map((l) => (
            <li key={l.code} role="none">
              <button
                role="menuitemradio"
                aria-checked={current === l.code}
                onClick={() => {
                  setAppLanguage(l.code);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 h-10 text-sm text-ink-800 hover:bg-ink-100 cursor-pointer"
              >
                <span>{l.label}</span>
                {current === l.code && <Check className="w-4 h-4 text-accent-700" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
