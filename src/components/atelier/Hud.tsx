/**
 * The slim bar on top of the stage: the way out, the progress pips (one per sentence, filled from the
 * round's real results only) and the two game switches, each with a word on it. Owns what it shows; the
 * switches live in `utils/gameCues` and the results in the round state.
 */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { setGameEffects, setGameSound, useGameSwitches } from '../../utils/gameCues';
import { Button } from '../ui/button';

export type Pip = 'first' | 'missed' | 'retried' | 'current' | 'todo';

const PIP: Record<Pip, string> = {
  first: 'bg-(--pip-first)',
  missed: 'bg-(--pip-missed)',
  retried: 'bg-(--pip-retried)',
  current: 'bg-ink-900',
  todo: 'bg-ink-300',
};

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <Button variant="outline" size="sm" aria-pressed={on} onClick={onToggle} className="gap-1.5 px-2.5">
      <span
        aria-hidden="true"
        className={cn('size-2.5 rounded-full', on ? 'bg-(--pip-first)' : 'border-2 border-ink-500')}
      />
      {label}
    </Button>
  );
}

export function Hud({
  onExit,
  pips,
  progress,
  children,
}: {
  onExit: () => void;
  pips?: Pip[];
  /** The pips as a sentence, for screen readers. */
  progress?: string;
  /** The switches, when the screen has them. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const switches = useGameSwitches();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3">
      <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={onExit}>
        <X className="h-4 w-4" aria-hidden="true" />
        {t('atelier.round.exit')}
      </Button>
      <div role="img" aria-label={progress} className="flex min-w-0 flex-1 items-center justify-center gap-1">
        {pips?.map((pip, index) => (
          <span
            key={index}
            className={cn('h-3 max-w-7 flex-1 rounded-[4px] shadow-[0_2px_0_rgb(0_0_0/0.4)]', PIP[pip])}
          />
        ))}
      </div>
      {children ?? (
        <>
          <Switch on={switches.sound} label={t('atelier.round.sound')} onToggle={() => setGameSound(!switches.sound)} />
          <Switch
            on={switches.effects}
            label={t('atelier.round.effects')}
            onToggle={() => setGameEffects(!switches.effects)}
          />
        </>
      )}
    </header>
  );
}
