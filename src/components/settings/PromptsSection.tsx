import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getPromptDefinition,
  getPromptOverrides,
  PROMPTS,
  renderTemplate,
  savePromptOverrides,
  usedVariables,
  type PromptId,
  type PromptOverrides,
} from '../../services/ai/prompts';
import type { Lang } from '../../services/ai/types';
import { LANGUAGES } from '../../i18n';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { SaveBar } from './SaveBar';

interface PromptsSectionProps {
  /** The edits on screen, and the overrides that are stored. */
  drafts: PromptOverrides;
  saved: PromptOverrides;
  onChange: (drafts: PromptOverrides) => void;
  /** Called with the overrides as stored after a save. */
  onSaved: (stored: PromptOverrides) => void;
}

/** The text that would be sent: the edit, or the default when it is blank or absent. */
function effective(overrides: PromptOverrides, id: PromptId, lang: Lang): string {
  const text = overrides[id]?.[lang];
  return text?.trim() ? text : getPromptDefinition(id).defaults[lang];
}

const differs = (a: PromptOverrides, b: PromptOverrides) =>
  PROMPTS.some((p) => (['en', 'zh'] as const).some((lang) => effective(a, p.id, lang) !== effective(b, p.id, lang)));

/** Settings → Prompts: view, edit and reset the prompts that tell the AI what to write. Saves on its own. */
export const PromptsSection: React.FC<PromptsSectionProps> = ({ drafts, saved, onChange, onSaved }) => {
  const { t, i18n } = useTranslation();
  const { status, run, clear } = useSaveStatus();
  const dirty = differs(drafts, saved);
  const [id, setId] = useState<PromptId>('word');
  const [lang, setLang] = useState<Lang>(i18n.language === 'zh' ? 'zh' : 'en');
  const [preview, setPreview] = useState(false);

  const def = getPromptDefinition(id);
  const value = drafts[id]?.[lang] ?? def.defaults[lang];
  const customized = drafts[id]?.[lang] !== undefined && drafts[id]![lang] !== def.defaults[lang];
  const unknown = usedVariables(value).filter((v) => !def.variables.includes(v));
  const missing = def.variables.filter(
    (v) => v !== 'transcript' && !usedVariables(value).includes(v) && v !== 'articleContext' && v !== 'userTranscript',
  );

  const edit = (next: PromptOverrides) => {
    clear();
    onChange(next);
  };
  const setValue = (text: string) => edit({ ...drafts, [id]: { ...drafts[id], [lang]: text } });
  const reset = () => {
    const next = { ...drafts, [id]: { ...drafts[id] } };
    delete next[id]![lang];
    edit(next);
  };
  // savePromptOverrides swallows storage errors, so the stored result is compared with what was typed.
  const save = () =>
    run(() => {
      savePromptOverrides(drafts);
      const stored = getPromptOverrides();
      if (differs(stored, drafts)) throw new Error(t('settings.notStored'));
      onSaved(stored);
    });

  const tab = (active: boolean) =>
    `h-8 px-3 rounded-md text-xs cursor-pointer ${active ? 'bg-accent-100 text-accent-950 font-medium' : 'text-ink-700 hover:bg-ink-100'}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500 leading-relaxed">{t('settings.promptsDesc')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={id}
          onChange={(e) => setId(e.target.value as PromptId)}
          aria-label={t('settings.promptTask')}
          className="h-10 px-3 rounded-md bg-surface border border-ink-300 text-sm text-ink-900 cursor-pointer"
        >
          {PROMPTS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(`prompts.${p.id}`)}
            </option>
          ))}
        </select>
        <div
          className="flex items-center rounded-md border border-ink-200 p-0.5"
          role="group"
          aria-label={t('settings.promptLanguage')}
        >
          {(['en', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={tab(lang === l)}
            >
              {LANGUAGES.find((x) => x.code === l)?.label}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-md border border-ink-200 p-0.5" role="group">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={tab(!preview)}>
            {t('settings.promptEdit')}
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={tab(preview)}>
            {t('settings.promptPreview')}
          </button>
        </div>
        {customized && (
          <button
            type="button"
            onClick={reset}
            className="h-8 px-3 rounded-md border border-ink-300 text-xs font-medium text-ink-800 hover:bg-ink-100 cursor-pointer"
          >
            {t('settings.promptReset')}
          </button>
        )}
      </div>

      {preview ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-ink-200 bg-ink-50 p-3 text-xs leading-relaxed font-mono text-ink-800">
          {renderTemplate(value, def.sample)}
        </pre>
      ) : (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={14}
          spellCheck={false}
          aria-label={t(`prompts.${id}`)}
          className="w-full rounded-md border border-ink-300 bg-surface p-3 text-xs leading-relaxed font-mono text-ink-900 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
        />
      )}

      <p className="text-xs text-ink-500 leading-relaxed">
        {t('settings.promptVariables')}{' '}
        {def.variables.map((v) => (
          <code key={v} className="mr-1.5 rounded bg-ink-100 px-1 py-0.5 text-ink-800">{`{{${v}}}`}</code>
        ))}
      </p>
      <p className="text-xs text-ink-500">{t('settings.promptSyntax', { open: '{{', close: '}}' })}</p>
      {unknown.length > 0 && (
        <p role="alert" className="text-xs text-bad-700">
          {t('settings.promptUnknown', { names: unknown.map((v) => `{{${v}}}`).join(' ') })}
        </p>
      )}
      {unknown.length === 0 && missing.length > 0 && (
        <p className="text-xs text-accent-900">
          {t('settings.promptMissing', { names: missing.map((v) => `{{${v}}}`).join(' ') })}
        </p>
      )}

      <SaveBar dirty={dirty} status={status} onSave={save} />
    </div>
  );
};
