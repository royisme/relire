/** The end of a settings section: its own Save button and the visible result of the last save. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { SaveStatus } from '../../hooks/useSaveStatus';
import { Button } from '../ui/button';

interface SaveBarProps {
  /** The section has edits that are not stored yet. */
  dirty: boolean;
  status: SaveStatus;
  onSave: () => void;
  /** Replaces "Saved" once the section has been saved (e.g. the key was checked as well). */
  savedText?: string;
  /** Other actions of the section, after Save. */
  children?: ReactNode;
}

export function SaveBar({ dirty, status, onSave, savedText, children }: SaveBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
      <Button type="button" onClick={onSave} disabled={!dirty}>
        {t('common.save')}
      </Button>
      {children}
      {/* Fixed height, so the result appears without moving what is below. */}
      <div className="min-h-5 min-w-0 text-sm">
        {status.phase === 'failed' ? (
          <p role="alert" className="text-bad-700 break-words">
            {status.message}
          </p>
        ) : dirty ? (
          <p role="status" className="text-ink-500">
            {t('settings.unsaved')}
          </p>
        ) : status.phase === 'saved' ? (
          <p role="status" className="inline-flex items-center gap-1 text-ok-800">
            <Check className="w-4 h-4" aria-hidden="true" />
            {savedText ?? t('settings.saved')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
