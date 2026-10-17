/** Labelled review fields shared by the source and draft editors. */
import type { ReactNode } from 'react';
export const field = 'w-full min-w-0 rounded-md border border-ink-300 bg-surface p-2 text-sm text-ink-900';
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  maxLength,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const props = {
    'aria-label': typeof label === 'string' ? label : undefined,
    className: field,
    value,
    maxLength,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <label className="block space-y-1 text-sm min-w-0">
      <span>{label}</span>
      {multiline ? <textarea {...props} rows={4} /> : <input {...props} />}
    </label>
  );
}
