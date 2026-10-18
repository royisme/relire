/**
 * Settings → AI services: one page for the text, OCR and speech purposes, sharing one provider key per
 * provider and one page-wide Save. Test and discovery use the draft and never save it.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getAiAccess } from '../../services/ai/access';
import { normalizeModelId } from '../../services/ai/catalogue';
import { errorMessage } from '../../services/ai/errors';
import { getProvider, providerRequiresKey, speechProviders, textProviders } from '../../services/ai/providers';
import { getApiKey, type AppSettings } from '../../utils/appSettings';
import { AI_PURPOSES, type AiPurposeRoute } from '../../utils/routes';
import { testSpeech } from '../../utils/speech';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';
import { fieldLabel, BaseUrlField, KeyBadge, KeyField, selectClass, useProviderNames } from './fields';
import type { KeyRequest } from './keyRequest';
import { ModelField } from './ModelField';
import { saveSlice, sliceOf } from './slices';
import type { useModelCatalogue } from './useModelCatalogue';

type Catalogue = ReturnType<typeof useModelCatalogue>;

interface AiSectionProps {
  /** Which purpose's page is open; the draft keeps every purpose and key it holds. */
  purpose: AiPurposeRoute;
  /** Page-local discovery, kept by Settings so switching purpose does not fetch the same list again. */
  catalogue: Catalogue;
  /** The key input, so a key request can focus it without focusing again on a purpose switch. */
  keyInput: RefObject<HTMLInputElement | null>;
  /** What the fields show (unsaved edits included) and what is stored. */
  draft: AppSettings;
  saved: AppSettings;
  onChange: (settings: AppSettings) => void;
  onSaved: (next: AppSettings) => void;
  /** Set when an AI feature needs a key: shows a notice, focuses the key field and can send the learner back. */
  keyRequest: KeyRequest | null;
  /** Leave Settings for where the learner was when the key was requested. */
  onReturn: (hash: string) => void;
}

export function AiSection({
  purpose,
  catalogue,
  keyInput,
  draft,
  saved,
  onChange,
  onSaved,
  keyRequest,
  onReturn,
}: AiSectionProps) {
  const { t } = useTranslation();
  const { providerName } = useProviderNames();
  const { status, run, clear } = useSaveStatus();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ ok: boolean; message: string } | null>(null);
  const checkToken = useRef(0);

  const providerId = draft[`${purpose}Provider`];
  const provider = getProvider(providerId);
  const model = draft[`${purpose}Model`];
  const key = draft.apiKeys[providerId] ?? '';
  const dirty = sliceOf(draft, 'ai') !== sliceOf(saved, 'ai');
  // The device voice is a declared kind of engine: no key, no model, no voice, and nothing to preview remotely.
  const device = purpose === 'speech' && provider.info.speech?.device === true;
  // A local provider needs no key, so nothing here asks for one.
  const needsKey = !device && providerRequiresKey(providerId);
  const savedProviderId = saved[`${purpose}Provider`];
  const missingKey = providerRequiresKey(savedProviderId) && !getApiKey(saved, savedProviderId);
  const modelReady = !!normalizeModelId(model) || device;
  // A provider with its own voice check shows a free-text field; the value is refused before it can be saved.
  const voiceAccepts = (voice: string) => provider.speech?.acceptsVoice?.(voice) ?? true;
  const voiceValid = voiceAccepts(draft.speechVoice);
  const others = AI_PURPOSES.filter((p) => p !== purpose && draft[`${p}Provider`] === providerId);
  const sharedNote =
    others.length > 0 &&
    t('aiSettings.sharedKey', {
      provider: providerName(providerId),
      purposes: others.map((p) => t(`aiSettings.purposes.${p}`)).join(', '),
    });

  // A check that finishes after the page is left, or after a newer one started, is ignored.
  useEffect(
    () => () => {
      checkToken.current++;
    },
    [],
  );

  const edit = (next: AppSettings) => {
    clear();
    setChecked(null);
    onChange(next);
  };
  // Changing the provider resets only this purpose's model (and the speech voice); other purposes stay.
  const pickProvider = (id: string) => {
    const chosen = getProvider(id).info;
    if (purpose === 'speech') {
      if (chosen.speech)
        edit({
          ...draft,
          speechProvider: id,
          speechModel: chosen.speech.defaultModel,
          speechVoice: chosen.speech.defaultVoice,
        });
    } else if (chosen.text) {
      edit(
        purpose === 'ocr'
          ? { ...draft, ocrProvider: id, ocrModel: chosen.text.defaultModel }
          : { ...draft, textProvider: id, textModel: chosen.text.defaultModel },
      );
    }
  };
  const setModel = (next: string) =>
    edit(
      purpose === 'speech'
        ? { ...draft, speechModel: next }
        : purpose === 'ocr'
          ? { ...draft, ocrModel: next }
          : { ...draft, textModel: next },
    );

  // Checks the key (or previews the voice) with the settings on screen. Never saves.
  const check = async () => {
    if ((needsKey && !key.trim()) || checking || !modelReady) return;
    const token = ++checkToken.current;
    setChecking(true);
    setChecked(null);
    clear();
    try {
      if (purpose === 'speech') await testSpeech(draft);
      else await getAiAccess(draft).checkConnection(purpose);
      if (token === checkToken.current)
        setChecked({
          ok: true,
          message: t(purpose === 'speech' ? 'settings.testSuccess' : 'aiSettings.checkSuccess'),
        });
    } catch (err) {
      if (token === checkToken.current)
        setChecked({
          ok: false,
          message: t(purpose === 'speech' ? 'settings.testFailed' : 'settings.keyCheckFailed', {
            msg: errorMessage(err, key),
          }),
        });
    } finally {
      if (token === checkToken.current) setChecking(false);
    }
  };

  // Saving keeps the choices; it is not a test of the key or the model.
  const save = () => run(() => onSaved(saveSlice(draft, 'ai')));

  const info = purpose === 'speech' ? provider.info.speech : provider.info.text;
  const returnTo = keyRequest?.returnTo ?? null;
  const canReturn = !dirty && !missingKey;

  return (
    <div className="space-y-6">
      <nav aria-label={t('aiSettings.purposesLabel')} className="flex flex-wrap gap-x-5 border-b border-ink-200">
        {AI_PURPOSES.map((entry) => (
          <Link
            key={entry}
            to={{ name: 'settings', section: 'ai', purpose: entry }}
            aria-current={entry === purpose ? 'page' : undefined}
            className={`-mb-px inline-flex h-10 items-center border-b-2 text-sm cursor-pointer ${
              entry === purpose
                ? 'border-accent-700 font-medium text-ink-950'
                : 'border-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            {t(`aiSettings.purposes.${entry}`)}
          </Link>
        ))}
      </nav>

      <p className="text-sm text-ink-700 leading-relaxed">{t(`aiSettings.purposeDesc.${purpose}`)}</p>

      {keyRequest && missingKey && (
        <p className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-900">
          {t(`settings.needsKeyNotice.${purpose}`)}
        </p>
      )}

      <div className="space-y-4">
        <label className="block">
          <span className={fieldLabel}>{t('settings.providerLabel')}</span>
          <select className={selectClass} value={providerId} onChange={(event) => pickProvider(event.target.value)}>
            {(purpose === 'speech' ? speechProviders() : textProviders()).map((entry) => (
              <option key={entry.info.id} value={entry.info.id}>
                {providerName(entry.info.id)}
              </option>
            ))}
          </select>
        </label>

        {device ? (
          <p className="text-sm text-ink-700 leading-relaxed">{t('aiSettings.deviceNote')}</p>
        ) : (
          <div className="space-y-1">
            <KeyBadge saved={saved} providerId={providerId} />
            <KeyField
              ref={keyInput}
              providerId={providerId}
              value={key}
              onChange={(value) => edit({ ...draft, apiKeys: { ...draft.apiKeys, [providerId]: value } })}
            />
            {sharedNote && <p className="text-xs text-ink-500 leading-relaxed">{sharedNote}</p>}
          </div>
        )}

        {!device && provider.info.defaultBaseUrl && (
          <BaseUrlField
            providerId={providerId}
            defaultUrl={provider.info.defaultBaseUrl}
            value={draft.baseUrls[providerId] ?? ''}
            onChange={(value) => edit({ ...draft, baseUrls: { ...draft.baseUrls, [providerId]: value } })}
          />
        )}

        {!device && <ModelField draft={draft} purpose={purpose} catalogue={catalogue} onChange={setModel} />}

        {!device &&
          purpose === 'speech' &&
          info &&
          'voices' in info &&
          (info.voices.length > 0 ? (
            <label className="block">
              <span className={fieldLabel}>{t('settings.voiceSection')}</span>
              <select
                className={selectClass}
                value={draft.speechVoice}
                onChange={(event) => edit({ ...draft, speechVoice: event.target.value })}
              >
                {info.voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {t(`voices.${voice.id}`, { defaultValue: voice.id })} ·{' '}
                    {t(voice.gender === 'female' ? 'settings.female' : 'settings.male')}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div>
              <label htmlFor="speech-voice" className={fieldLabel}>
                {t('aiSettings.voiceLabel')}
              </label>
              <input
                id="speech-voice"
                autoComplete="off"
                spellCheck={false}
                value={draft.speechVoice}
                aria-invalid={!voiceValid}
                aria-describedby="speech-voice-help"
                onChange={(event) => edit({ ...draft, speechVoice: event.target.value })}
                className={selectClass}
              />
              <p
                id="speech-voice-help"
                className={`text-xs mt-1 leading-relaxed ${voiceValid ? 'text-ink-500' : 'text-bad-700'}`}
              >
                {t(voiceValid ? 'aiSettings.voiceHelp' : 'aiSettings.invalidVoice')}
              </p>
            </div>
          ))}

        {purpose === 'ocr' && <p className="text-xs text-ink-500 leading-relaxed">{t('aiSettings.ocrNote')}</p>}
      </div>

      <div className="space-y-3 border-t border-ink-200 pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void check()}
            disabled={checking || (needsKey && !key.trim()) || !modelReady}
          >
            {t(
              checking
                ? purpose === 'speech'
                  ? 'settings.testingBtn'
                  : 'settings.checking'
                : purpose === 'speech'
                  ? 'aiSettings.preview'
                  : needsKey
                    ? 'aiSettings.check'
                    : 'aiSettings.checkServer',
            )}
          </Button>
          <Button type="button" onClick={save} disabled={!dirty}>
            {t('common.save')}
          </Button>
        </div>
        {/* Fixed height, so the outcome appears without moving the page. */}
        <div className="min-h-10 text-sm">
          {checked && (
            <p
              role={checked.ok ? 'status' : 'alert'}
              className={`break-words ${checked.ok ? 'text-ok-800' : 'text-bad-700'}`}
            >
              {checked.message}
            </p>
          )}
          {status.phase === 'failed' ? (
            <p role="alert" className="text-bad-700 break-words">
              {status.message}
            </p>
          ) : dirty ? (
            <p className="text-ink-500">{t('settings.unsaved')}</p>
          ) : status.phase === 'saved' ? (
            <p role="status" className="text-ok-800">
              {t('settings.saved')}
            </p>
          ) : (
            <p className="text-ink-500">{t('aiSettings.savedNote')}</p>
          )}
        </div>
      </div>

      {returnTo && (
        // Always drawn while a request is pending, so it does not appear and move what is below.
        <div className="border-t border-ink-200 pt-4">
          <Button type="button" variant="outline" disabled={!canReturn} onClick={() => onReturn(returnTo)}>
            {t('settings.returnToWork')}
          </Button>
        </div>
      )}
    </div>
  );
}
