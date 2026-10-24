/**
 * Settings → Content service: the optional service's address and access key, a live Test of the draft
 * values, and the Enable switch a passing Test unlocks. Saves on its own like the other sections.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeBaseUrl } from '../../services/ai/baseUrl';
import {
  ContentServiceHttpError,
  ContentServiceNetworkError,
  testContentService,
} from '../../services/grammarTopics/service';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import type { AppSettings } from '../../utils/appSettings';
import { Button } from '../ui/button';
import { fieldLabel } from './fields';
import { SaveBar } from './SaveBar';
import { saveSlice, sliceOf } from './slices';

interface ServiceSectionProps {
  /** What the fields show (unsaved edits included) and what is stored. */
  draft: AppSettings;
  saved: AppSettings;
  onChange: (settings: AppSettings) => void;
  onSaved: (next: AppSettings) => void;
}

/** The outcome a Test shows: the real result, never a guess or a count. */
const testMessage = (error: unknown, t: (key: string, options?: Record<string, string>) => string) =>
  error instanceof ContentServiceHttpError && error.status === 401
    ? t('serviceSettings.testRejected')
    : error instanceof ContentServiceHttpError && error.status === 429
      ? t('serviceSettings.testLimited')
      : error instanceof ContentServiceHttpError
        ? t('serviceSettings.testStatus', { msg: error.message })
        : error instanceof ContentServiceNetworkError
          ? t('serviceSettings.testNetwork')
          : // A 200 that is not the topic list: the schema's or the parser's real reason.
            t('serviceSettings.testInvalidBody', { msg: error instanceof Error ? error.message : String(error) });

export function ServiceSection({ draft, saved, onChange, onSaved }: ServiceSectionProps) {
  const { t } = useTranslation();
  const { status, run, clear } = useSaveStatus();
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
  // The values a Test passed for; the switch turns on only while the draft still holds exactly them.
  const [passed, setPassed] = useState<{ url: string; key: string } | null>(null);
  // Bumped on every edit and on unmount, so a Test that lands afterwards cannot answer for the new values.
  const testToken = useRef(0);
  useEffect(() => () => void testToken.current++, []);

  const { enabled, url, key } = draft.contentService;
  const urlUsable = !!normalizeBaseUrl(url);
  // The values a Test would use: the draft's address as requests spell it, and the key without padding.
  const current = { url: normalizeBaseUrl(url) ?? '', key: key.trim() };
  const canEnable = passed !== null && passed.url === current.url && passed.key === current.key;
  const dirty = sliceOf(draft, 'service') !== sliceOf(saved, 'service');

  /** An edit to either field turns the service off and voids any pass, so a result cannot answer for it. */
  const editField = (next: AppSettings) => {
    clear();
    setTested(null);
    setPassed(null);
    testToken.current++;
    setTesting(false);
    onChange(next);
  };
  const setUrl = (value: string) =>
    editField({ ...draft, contentService: { ...draft.contentService, url: value, enabled: false } });
  const setKey = (value: string) =>
    editField({ ...draft, contentService: { ...draft.contentService, key: value, enabled: false } });
  // Turning the service off needs no Test; turning it on needs a pass for the values on screen.
  const toggle = () => {
    if (enabled) {
      clear();
      onChange({ ...draft, contentService: { ...draft.contentService, enabled: false } });
      return;
    }
    if (!canEnable) return;
    clear();
    onChange({ ...draft, contentService: { ...draft.contentService, enabled: true } });
  };

  const test = async () => {
    if (testing || !urlUsable || !current.key) return;
    const token = ++testToken.current;
    setTesting(true);
    setTested(null);
    clear();
    try {
      await testContentService(current.url, current.key);
      if (token === testToken.current) {
        setTested({ ok: true, message: t('serviceSettings.testSuccess') });
        setPassed(current);
      }
    } catch (error) {
      if (token === testToken.current) setTested({ ok: false, message: testMessage(error, t) });
    } finally {
      if (token === testToken.current) setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <label htmlFor="service-url" className="block">
          <span className={fieldLabel}>{t('serviceSettings.urlLabel')}</span>
          <input
            id="service-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('serviceSettings.urlPlaceholder')}
            value={url}
            aria-invalid={!!url.trim() && !urlUsable}
            aria-describedby="service-url-help"
            onChange={(event) => setUrl(event.target.value)}
            className="w-full h-10 px-3 rounded-md bg-surface border border-ink-300 text-sm font-mono focus:outline-none focus:border-accent-600"
          />
          <p
            id="service-url-help"
            className={`text-xs mt-1 leading-relaxed ${urlUsable || !url.trim() ? 'text-ink-500' : 'text-bad-700'}`}
          >
            {t(urlUsable || !url.trim() ? 'serviceSettings.urlHelp' : 'serviceSettings.urlInvalid')}
          </p>
        </label>

        <label htmlFor="service-key" className="block">
          <span className={fieldLabel}>{t('serviceSettings.keyLabel')}</span>
          <input
            id="service-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="w-full h-10 px-3 rounded-md bg-surface border border-ink-300 text-sm font-mono focus:outline-none focus:border-accent-600"
          />
          <p className="text-xs text-ink-500 mt-1 leading-relaxed">{t('serviceSettings.keyHelp')}</p>
        </label>
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void test()}
          disabled={testing || !urlUsable || !current.key}
        >
          {t(testing ? 'serviceSettings.testingBtn' : 'serviceSettings.testBtn')}
        </Button>
        {/* Fixed height, so the result appears without moving the page. */}
        <div data-service-test-result className="h-16 overflow-y-auto text-sm" role="status" aria-live="polite">
          {tested && (
            <p
              role={tested.ok ? 'status' : 'alert'}
              className={`break-words ${tested.ok ? 'text-ok-800' : 'text-bad-700'}`}
            >
              {tested.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="flex min-h-10 items-center gap-3">
          <button
            type="button"
            role="switch"
            data-service-enable
            aria-checked={enabled}
            aria-label={t('serviceSettings.enableLabel')}
            disabled={!enabled && !canEnable}
            onClick={toggle}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              aria-hidden="true"
              className={`relative h-4 w-7 shrink-0 rounded-full ${enabled ? 'bg-accent-700' : 'bg-ink-500'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-surface ${enabled ? 'translate-x-3' : ''}`}
              />
            </span>
          </button>
          <span className="min-w-0 text-sm text-ink-900">{t('serviceSettings.enableLabel')}</span>
        </div>
        <p className="text-xs leading-relaxed text-ink-500 break-words">{t('serviceSettings.enableNote')}</p>
      </div>

      <SaveBar dirty={dirty} status={status} onSave={() => run(() => onSaved(saveSlice(draft, 'service')))} />
    </div>
  );
}
