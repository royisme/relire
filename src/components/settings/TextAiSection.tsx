import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { getProvider, textProviders } from '../../services/ai/providers';
import { checkTextKey } from '../../services/api';
import { errorMessage } from '../../services/ai/errors';
import { getApiKey, type AppSettings } from '../../utils/appSettings';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { Button } from '../ui/button';
import { fieldLabel, KeyBadge, KeyField, selectClass, useProviderNames } from './fields';
import type { KeyRequest } from './keyRequest';
import { SaveBar } from './SaveBar';
import { saveSlice, sliceOf } from './slices';

interface TextAiSectionProps {
  /** What the fields show (unsaved edits included) and what is stored. */
  draft: AppSettings;
  saved: AppSettings;
  onChange: (settings: AppSettings) => void;
  onSaved: (next: AppSettings) => void;
  /** Set when an AI feature needs a key: shows a notice and focuses the key field. */
  keyRequest: KeyRequest | null;
  /** Leave Settings for where the learner was when the key was requested. */
  onReturn: (hash: string) => void;
}

/** Settings → Text AI: which provider and model write the answers, and the key for it. Saves on its own. */
export const TextAiSection: React.FC<TextAiSectionProps> = ({
  draft,
  saved,
  onChange,
  onSaved,
  keyRequest,
  onReturn,
}) => {
  const { t } = useTranslation();
  const { providerName, modelName, modelDesc } = useProviderNames();
  const { status, run, fail, clear } = useSaveStatus();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const keyInput = useRef<HTMLInputElement>(null);
  const checkToken = useRef(0);

  const info = getProvider(draft.textProvider).info.text!;
  const key = draft.apiKeys[draft.textProvider] ?? '';
  const dirty = sliceOf(draft, 'text') !== sliceOf(saved, 'text');

  const missingKey = !getApiKey(saved, saved.textProvider);

  // A key request lands here with the field ready to type into.
  useEffect(() => {
    if (keyRequest && missingKey) keyInput.current?.focus();
  }, [keyRequest, missingKey]);
  // A check that finishes after the page is left, or after a newer one started, is ignored.
  useEffect(
    () => () => {
      checkToken.current++;
    },
    [],
  );

  const edit = (next: AppSettings) => {
    clear();
    setChecked(false);
    onChange(next);
  };
  const pickProvider = (id: string) =>
    edit({ ...draft, textProvider: id, textModel: getProvider(id).info.text!.defaultModel });

  const save = () => {
    run(() => onSaved(saveSlice(draft, 'text')));
  };

  // Checks the key with the provider and model on screen, and saves the section only if it works.
  const checkAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || checking) return;
    const token = ++checkToken.current;
    setChecking(true);
    clear();
    try {
      await checkTextKey(key.trim(), draft);
      if (token !== checkToken.current) return;
      setChecked(run(() => onSaved(saveSlice(draft, 'text'))));
    } catch (err) {
      if (token === checkToken.current) fail(t('settings.keyCheckFailed', { msg: errorMessage(err) }));
    } finally {
      if (token === checkToken.current) setChecking(false);
    }
  };

  // Offered once the stored key is in place, so the learner can carry on with what they were doing.
  const returnTo = keyRequest?.returnTo ?? null;
  const canReturn = !dirty && !missingKey;

  return (
    <form onSubmit={checkAndSave} className="space-y-4">
      {keyRequest && missingKey && (
        <p className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-900">
          {t('settings.needsKeyNotice')}
        </p>
      )}

      <KeyBadge saved={saved} providerId={saved.textProvider} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={fieldLabel}>{t('settings.providerLabel')}</span>
          <select className={selectClass} value={draft.textProvider} onChange={(e) => pickProvider(e.target.value)}>
            {textProviders().map((p) => (
              <option key={p.info.id} value={p.info.id}>
                {providerName(p.info.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={fieldLabel}>{t('settings.modelLabel')}</span>
          <select
            className={selectClass}
            value={draft.textModel}
            onChange={(e) => edit({ ...draft, textModel: e.target.value })}
          >
            {info.models.map((m) => (
              <option key={m} value={m}>
                {modelName(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {modelDesc(draft.textModel) && (
        <p className="text-xs text-ink-500 leading-relaxed">{modelDesc(draft.textModel)}</p>
      )}

      <KeyField
        ref={keyInput}
        providerId={draft.textProvider}
        value={key}
        onChange={(value) => edit({ ...draft, apiKeys: { ...draft.apiKeys, [draft.textProvider]: value } })}
      />

      <SaveBar dirty={dirty} status={status} onSave={save} savedText={checked ? t('settings.keyChecked') : undefined}>
        <Button type="submit" variant="outline" disabled={!key.trim() || checking}>
          {checking && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {checking ? t('settings.checking') : t('settings.checkAndSave')}
        </Button>
      </SaveBar>

      {returnTo && (
        // Always drawn while a request is pending, so it does not appear and move what is below.
        <div className="border-t border-ink-200 pt-4">
          <Button type="button" variant="outline" disabled={!canReturn} onClick={() => onReturn(returnTo)}>
            {t('settings.returnToWork')}
          </Button>
        </div>
      )}
    </form>
  );
};
