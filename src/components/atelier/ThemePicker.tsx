/**
 * The first screen of the sentence workshop: a theme chosen from a bin of bricks, a level, and Start.
 * Pressing Start shows its pending state on the button itself. Owns the picks only; the AI writes the
 * practice from the theme, and loading the round is the caller's.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoundChoice } from '../../services/atelier/source';
import { AtelierLevelSchema, type AtelierLevel } from '../../types/atelier';
import type { Theme } from '../../types/themes';
import { Button } from '../ui/button';
import { Hud } from './Hud';
import type { Hue } from './roles';

const HUES: Hue[] = ['yellow', 'blue', 'red', 'green', 'purple', 'grey'];

interface ThemePickerProps {
  themes: Theme[];
  loading: boolean;
  /** The real reason the last round could not start. */
  error: string | null;
  /** The choice of the round just played, so "Play again" comes back to them. */
  initial: RoundChoice | null;
  onStart: (choice: RoundChoice) => void;
  onLeave: () => void;
}

export function ThemePicker({ themes, loading, error, initial, onStart, onLeave }: ThemePickerProps) {
  const { t } = useTranslation();
  const [themeId, setThemeId] = useState(initial?.themeId ?? themes[0].id);
  const [level, setLevel] = useState<AtelierLevel>(initial?.level ?? 'A2');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Hud onExit={onLeave} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        <div>
          <h3 className="font-serif text-2xl font-semibold">{t('atelier.title')}</h3>
          <p className="text-sm text-ink-700">{t('atelier.subtitle')}</p>
        </div>
        <div role="radiogroup" aria-label={t('atelier.pick.theme')} className="grid grid-cols-2 gap-x-2.5 gap-y-2 pt-1">
          {themes.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={candidate.id === themeId}
              disabled={loading}
              onClick={() => setThemeId(candidate.id)}
              className="brick-btn text-left disabled:opacity-60"
            >
              <span
                data-hue={HUES[index % HUES.length]}
                data-shape="verb"
                data-state={candidate.id === themeId ? 'picked' : undefined}
                className="brick min-h-12! w-full items-start! justify-center! px-2.5! py-1.5! text-left"
              >
                <span className="brick-studs" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="brick-word w-full text-left text-sm! leading-[18px]!">
                  {t(`themes.${candidate.id}.name`)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span id="atelier-level-label" className="text-sm text-ink-700">
            {t('atelier.pick.level')}
          </span>
          <div role="radiogroup" aria-labelledby="atelier-level-label" className="flex flex-1 gap-2.5">
            {AtelierLevelSchema.options.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={value === level}
                disabled={loading}
                onClick={() => setLevel(value)}
                className="brick-btn flex-1 disabled:opacity-60"
              >
                <span
                  data-hue="grey"
                  data-shape="mark"
                  data-state={value === level ? 'picked' : undefined}
                  className="brick min-h-11! w-full"
                >
                  <span className="brick-studs" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <span className="brick-word">{value}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <footer className="relative shrink-0 bg-ink-50 px-3 pt-2 pb-3">
        <div aria-live="polite" className="pointer-events-none absolute inset-x-3 bottom-full mb-2">
          {error && (
            <p role="alert" className="atelier-slip break-words" data-kind="bad">
              {error}
            </p>
          )}
        </div>
        <Button
          className="game-cta"
          aria-busy={loading}
          aria-disabled={loading || undefined}
          onClick={() => {
            if (loading) return;
            onStart({ themeId, level });
          }}
        >
          {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          {t('atelier.pick.start')}
        </Button>
      </footer>
    </div>
  );
}
