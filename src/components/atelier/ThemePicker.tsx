/**
 * The first screen of the sentence workshop: a theme chosen from a bin of bricks, an optional subtopic and
 * task (left to chance when "Any"), a level, and Start. Pressing Start shows its pending state on the
 * button itself. Owns the picks only; loading the round is the caller's.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoundPicks } from '../../services/atelier/source';
import { AtelierLevelSchema, type AtelierLevel } from '../../types/atelier';
import { TaskIdSchema, type TaskId, type Theme } from '../../types/themes';
import { Button } from '../ui/button';
import { Hud } from './Hud';
import type { Hue } from './roles';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const ANY = 'any';
const HUES: Hue[] = ['yellow', 'blue', 'red', 'green', 'purple', 'white'];

interface ThemePickerProps {
  themes: Theme[];
  loading: boolean;
  /** The real reason the last round could not start. */
  error: string | null;
  /** The picks of the round just played, so "Play again" comes back to them. */
  initial: RoundPicks | null;
  onStart: (picks: RoundPicks) => void;
  onLeave: () => void;
}

function Field({
  id,
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label id={`${id}-label`} className="mb-1 block text-sm text-ink-700">
        {label}
      </label>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger aria-labelledby={`${id}-label`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ThemePicker({ themes, loading, error, initial, onStart, onLeave }: ThemePickerProps) {
  const { t } = useTranslation();
  const [themeId, setThemeId] = useState(initial?.themeId ?? themes[0].id);
  const [subtopicId, setSubtopicId] = useState(initial?.subtopicId ?? ANY);
  const [taskId, setTaskId] = useState<string>(initial?.taskId ?? ANY);
  const [level, setLevel] = useState<AtelierLevel>(initial?.level ?? 'A2');
  const theme = themes.find((candidate) => candidate.id === themeId)!;
  const subtopic = theme.subtopics.find((candidate) => candidate.id === subtopicId);

  // A subtopic and a task must suit each other, so each list offers only what fits the other pick.
  const tasks = subtopic ? subtopic.tasks : TaskIdSchema.options;
  const subtopics =
    taskId === ANY ? theme.subtopics : theme.subtopics.filter((s) => s.tasks.includes(taskId as TaskId));
  const any = { value: ANY, label: t('atelier.pick.any') };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Hud onExit={onLeave} />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        <div>
          <h3 className="font-serif text-3xl font-semibold">{t('atelier.title')}</h3>
          <p className="mt-1 text-ink-700">{t('atelier.subtitle')}</p>
        </div>
        <div role="radiogroup" aria-label={t('atelier.pick.theme')} className="grid grid-cols-2 gap-x-3 gap-y-4 pt-1">
          {themes.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={candidate.id === themeId}
              disabled={loading}
              onClick={() => {
                setThemeId(candidate.id);
                setSubtopicId(ANY);
                setTaskId(ANY);
              }}
              className="brick-btn text-left disabled:opacity-60"
            >
              <span
                data-hue={HUES[index % HUES.length]}
                data-shape="verb"
                data-state={candidate.id === themeId ? 'picked' : undefined}
                className="brick min-h-14! w-full items-start! px-3! py-2! text-left"
              >
                <span className="brick-studs" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="brick-word text-base! leading-5!">{t(`themes.${candidate.id}.name`)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="atelier-subtopic"
            label={t('atelier.pick.subtopic')}
            value={subtopicId}
            disabled={loading}
            items={[any, ...subtopics.map((s) => ({ value: s.id, label: t(`themes.${themeId}.subtopics.${s.id}`) }))]}
            onChange={setSubtopicId}
          />
          <Field
            id="atelier-task"
            label={t('atelier.pick.task')}
            value={taskId}
            disabled={loading}
            items={[any, ...tasks.map((id) => ({ value: id, label: t(`atelier.tasks.${id}`) }))]}
            onChange={setTaskId}
          />
        </div>
        <div>
          <span id="atelier-level-label" className="mb-2 block text-sm text-ink-700">
            {t('atelier.pick.level')}
          </span>
          <div role="radiogroup" aria-labelledby="atelier-level-label" className="flex gap-3 pt-1">
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
                  data-hue="white"
                  data-shape="mark"
                  data-state={value === level ? 'picked' : undefined}
                  className="brick min-h-12! w-full"
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
            onStart({
              themeId,
              level,
              ...(subtopicId === ANY ? {} : { subtopicId }),
              ...(taskId === ANY ? {} : { taskId: taskId as TaskId }),
            });
          }}
        >
          {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          {t('atelier.pick.start')}
        </Button>
      </footer>
    </div>
  );
}
