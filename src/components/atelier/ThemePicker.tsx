/**
 * The first screen of the sentence workshop: a theme, an optional subtopic and
 * task (left to chance when "Any"), a level, and Start. Pressing Start shows its
 * pending state on the button itself. Owns the picks only; loading the round is
 * the caller's.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoundPicks } from '../../services/atelier/source';
import { AtelierLevelSchema, type AtelierLevel } from '../../types/atelier';
import { TaskIdSchema, type TaskId, type Theme } from '../../types/themes';
import { Button } from '../ui/button';
import { Segmented } from '../ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const ANY = 'any';

interface ThemePickerProps {
  themes: Theme[];
  loading: boolean;
  /** The real reason the last round could not start. */
  error: string | null;
  /** The picks of the round just played, so "Play again" comes back to them. */
  initial: RoundPicks | null;
  onStart: (picks: RoundPicks) => void;
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

export function ThemePicker({ themes, loading, error, initial, onStart }: ThemePickerProps) {
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
    <div className="rounded-lg border border-ink-200 bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="atelier-theme"
          label={t('atelier.pick.theme')}
          value={themeId}
          disabled={loading}
          items={themes.map((candidate) => ({ value: candidate.id, label: t(`themes.${candidate.id}.name`) }))}
          onChange={(next) => {
            setThemeId(next as Theme['id']);
            setSubtopicId(ANY);
            setTaskId(ANY);
          }}
        />
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
        <div>
          <span className="mb-1 block text-sm text-ink-700">{t('atelier.pick.level')}</span>
          <Segmented
            label={t('atelier.pick.level')}
            value={level}
            onChange={setLevel}
            options={AtelierLevelSchema.options.map((value) => ({ value, label: value }))}
          />
        </div>
      </div>
      <div className="mt-4 h-16 overflow-y-auto text-sm" aria-live="polite">
        {error && (
          <p role="alert" className="break-words text-bad-700">
            {error}
          </p>
        )}
      </div>
      <Button
        className="min-w-28"
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
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t('atelier.pick.start')}
      </Button>
    </div>
  );
}
