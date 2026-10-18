/**
 * Settings → Practice: how answers are compared and dictation is played —
 * strict accents, the dictation speed, speaking again after a check, and whether
 * that automatic playback may synthesize remotely. Saves on its own like the other sections.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { DICTATION_SPEEDS, type AppSettings } from '../../utils/appSettings';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { fieldLabel } from './fields';
import { SaveBar } from './SaveBar';
import { saveSlice, sliceOf } from './slices';

interface PracticeSectionProps {
  /** What the fields show (unsaved edits included) and what is stored. */
  draft: AppSettings;
  saved: AppSettings;
  onChange: (settings: AppSettings) => void;
  onSaved: (next: AppSettings) => void;
}

/** One preference with a checkbox and a line of explanation. */
function CheckField({
  checked,
  label,
  note,
  onToggle,
}: {
  checked: boolean;
  label: string;
  note: string;
  onToggle: () => void;
}) {
  return (
    <label className="flex min-h-10 items-start gap-2 text-sm text-ink-900 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5 h-4 w-4 accent-accent-700" />
      <span className="min-w-0">
        <span className="block">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500 break-words">{note}</span>
      </span>
    </label>
  );
}

export const PracticeSection: React.FC<PracticeSectionProps> = ({ draft, saved, onChange, onSaved }) => {
  const { t } = useTranslation();
  const { status, run, clear } = useSaveStatus();
  const dirty = sliceOf(draft, 'practice') !== sliceOf(saved, 'practice');

  const edit = (next: AppSettings) => {
    clear();
    onChange(next);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <CheckField
          checked={draft.practiceStrictAccents}
          label={t('settings.strictAccents')}
          note={t('settings.strictAccentsNote')}
          onToggle={() => edit({ ...draft, practiceStrictAccents: !draft.practiceStrictAccents })}
        />
        <CheckField
          checked={draft.practiceSpeakAfterCheck}
          label={t('settings.speakAfterCheck')}
          note={t('settings.speakAfterCheckNote')}
          onToggle={() => edit({ ...draft, practiceSpeakAfterCheck: !draft.practiceSpeakAfterCheck })}
        />
        <CheckField
          checked={draft.practiceRemoteAutoSpeak}
          label={t('settings.remoteAutoSpeak')}
          note={t('settings.remoteAutoSpeakNote')}
          onToggle={() => edit({ ...draft, practiceRemoteAutoSpeak: !draft.practiceRemoteAutoSpeak })}
        />
      </div>

      <div>
        <span className={fieldLabel}>{t('settings.dictationSpeed')}</span>
        <div role="group" className="flex max-w-full flex-wrap gap-1">
          {DICTATION_SPEEDS.map((rate) => {
            const selected = draft.practiceDictationSpeed === rate;
            return (
              <button
                key={rate}
                type="button"
                aria-pressed={selected}
                onClick={() => edit({ ...draft, practiceDictationSpeed: rate })}
                className={`tnum min-h-10 rounded-md px-3 text-sm cursor-pointer ${
                  selected ? 'bg-accent-100 font-medium text-accent-900' : 'text-ink-700 hover:bg-ink-100'
                }`}
              >
                {rate === 1 ? '1×' : `${rate}×`}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">{t('settings.dictationSpeedNote')}</p>
      </div>

      <SaveBar dirty={dirty} status={status} onSave={() => run(() => onSaved(saveSlice(draft, 'practice')))} />
    </div>
  );
};
