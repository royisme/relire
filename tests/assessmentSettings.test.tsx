/** Assessment Settings and the actual backup helpers used by BackupControls; no browser storage is touched. */
import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as translations from 'react-i18next';
import i18n from '../src/i18n';
import { getAppSettings, saveAppSettings, type AppSettings } from '../src/utils/appSettings';
import { saveSlice, sliceOf, withSlice } from '../src/components/settings/slices';
import { exportSettingsBackup, restoreSettingsBackup } from '../src/components/settings/backupSettings';
import { KeyField, RegionField } from '../src/components/settings/fields';
import { ModelField } from '../src/components/settings/ModelField';
import { Button } from '../src/components/ui/button';
import * as statusHook from '../src/hooks/useSaveStatus';
import { azureAssessment } from '../src/services/ai/providers/azure/client';
import type { AiPurpose } from '../src/services/ai/types';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    location: { hash: '' },
    relireHistory: { read: () => 0 },
  }),
});
const { AiSection } = await import('../src/components/settings/AiSection');
afterAll(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
});
afterEach(() => {
  mock.restore();
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const configured = (): AppSettings => ({
  ...getAppSettings(),
  textModel: 'custom-text',
  ocrModel: 'custom-ocr',
  speechModel: 'custom-speech',
  apiKeys: { gemini: 'TEST-shared-key', azure: 'TEST-azure-key' },
  providerRegions: { azure: 'canadaeast' },
});

test('region and assessment provider roundtrip without disturbing custom old-purpose models or shared keys', () => {
  const base = getAppSettings();
  const draft = configured();
  expect(sliceOf(draft, 'ai')).not.toBe(sliceOf(base, 'ai'));
  const stored = saveSlice({ ...draft, providerRegions: { azure: ' canadaeast ' } }, 'ai');
  expect(getAppSettings()).toEqual(stored);
  expect(stored.providerRegions).toEqual({ azure: 'canadaeast' });
  expect([stored.textModel, stored.ocrModel, stored.speechModel]).toEqual([
    'custom-text',
    'custom-ocr',
    'custom-speech',
  ]);
  expect(stored.apiKeys).toEqual(draft.apiKeys);
  expect(stored.assessmentModel).toBe('');
  expect(sliceOf({ ...stored, providerRegions: { azure: 'eastus' } }, 'ai')).not.toBe(sliceOf(stored, 'ai'));
  expect(sliceOf({ ...stored, assessmentProvider: 'invalid-provider' }, 'ai')).not.toBe(sliceOf(stored, 'ai'));
  const practice = withSlice(
    stored,
    { ...stored, providerRegions: { azure: 'eastus' }, practiceStrictAccents: true },
    'practice',
  );
  expect(practice.providerRegions).toEqual({ azure: 'canadaeast' });
  expect(practice.practiceStrictAccents).toBe(true);
  expect(withSlice(base, stored, 'ai').providerRegions).toEqual(stored.providerRegions);
});

test('missing region with a key and invalid nonempty drafts refuse Save, including after switching purpose', () => {
  for (const region of ['', ' ', 'canada east', 'https://host.test', 'canada/east', 'eastus?key=1']) {
    const draft = { ...configured(), providerRegions: { azure: region } };
    expect(() => saveSlice(draft, 'ai')).toThrow(i18n.t('azureAssessment.invalidRegion'));
    expect(getAppSettings().providerRegions).toEqual({});
  }
  // No key and no region remains intentionally unconfigured, so unrelated AI settings can still save.
  expect(saveSlice({ ...getAppSettings(), textModel: 'custom' }, 'ai').textModel).toBe('custom');
  expect(() => saveSlice({ ...getAppSettings(), providerRegions: { azure: 'invalid region' } }, 'ai')).toThrow();
});

test('storage has no silent region default, validates malformed values and keeps assessment model-less', () => {
  for (const providerRegions of [null, [], { azure: 7 }, { azure: 'bad/region' }, { azure: '' }]) {
    storage.set('relire_app_settings_v1', JSON.stringify({ providerRegions, assessmentModel: 'invented-model' }));
    expect(getAppSettings().providerRegions).toEqual({});
    expect(getAppSettings().assessmentModel).toBe('');
  }
  expect(saveAppSettings({ assessmentProvider: 'gemini' }).assessmentProvider).toBe('azure');
});

test('a region write refused or changed by storage is not reported as saved', () => {
  saveSlice(configured(), 'ai');
  const local = globalThis.localStorage.setItem.bind(globalThis.localStorage);
  const write = spyOn(globalThis.localStorage, 'setItem').mockImplementation((key, value) => {
    const parsed = JSON.parse(value);
    parsed.providerRegions.azure = 'canadaeast';
    local(key, JSON.stringify(parsed));
  });
  expect(() => saveSlice({ ...getAppSettings(), providerRegions: { azure: 'eastus' } }, 'ai')).toThrow(
    i18n.t('settings.notStored'),
  );
  write.mockRestore();
  expect(getAppSettings().providerRegions.azure).toBe('canadaeast');
});

test('actual backup serialization excludes every key and region, but retains public selections and endpoints', () => {
  saveAppSettings({ ...configured(), baseUrls: { openai: 'https://TEST-endpoint.test/v1' } });
  const serialized = JSON.stringify({ settings: exportSettingsBackup() });
  expect(serialized).not.toContain('apiKeys');
  expect(serialized).not.toContain('providerRegions');
  expect(serialized).not.toContain('TEST-shared-key');
  expect(serialized).not.toContain('TEST-azure-key');
  expect(serialized).not.toContain('canadaeast');
  const payload = JSON.parse(serialized).settings;
  expect(payload.assessmentProvider).toBe('azure');
  expect(payload.assessmentModel).toBe('');
  expect(payload.textModel).toBe('custom-text');
  expect(payload.baseUrls).toEqual({ openai: 'https://TEST-endpoint.test/v1' });
});

test('actual restore ignores imported keys/regions, preserves all local credentials and restores other settings', () => {
  saveAppSettings({
    ...configured(),
    apiKeys: { ...configured().apiKeys, unused: 'TEST-unused-local' },
    providerRegions: { azure: 'canadaeast', unused: 'local-region' },
  });
  const local = getAppSettings();
  const payload = JSON.parse(JSON.stringify(exportSettingsBackup()));
  payload.apiKeys = { azure: 'TEST-imported-secret', attacker: 'TEST-foreign-key' };
  payload.providerRegions = { azure: 'eastus', attacker: 'foreign-region' };
  payload.ocrModel = 'restored-custom-ocr';
  const next = restoreSettingsBackup(payload);
  expect(getAppSettings()).toEqual(next);
  expect(next.apiKeys).toEqual(local.apiKeys);
  expect(next.providerRegions).toEqual(local.providerRegions);
  expect(next.ocrModel).toBe('restored-custom-ocr');
  storage.clear();
  restoreSettingsBackup(payload);
  expect(getAppSettings().apiKeys).toEqual({});
  expect(getAppSettings().providerRegions).toEqual({});
});

test('the real AI form keeps edits across purpose remounts, omits model/discovery and pins an in-flight check', async () => {
  spyOn(React, 'useState').mockImplementation(((initial?: unknown) => [initial, () => {}]) as typeof React.useState);
  spyOn(React, 'useRef').mockImplementation(((value: unknown) => ({ current: value })) as typeof React.useRef);
  spyOn(React, 'useEffect').mockImplementation(() => {});
  spyOn(translations, 'useTranslation').mockReturnValue({ t: (key: string) => key } as never);
  spyOn(statusHook, 'useSaveStatus').mockReturnValue({
    status: { phase: 'idle' },
    run: (save) => {
      save();
      return true;
    },
    clear() {},
    fail() {},
  });
  let draft = getAppSettings();
  let saved = draft;
  const render = (purpose: AiPurpose) => {
    const tree = AiSection({
      purpose,
      draft,
      saved,
      keyInput: { current: null },
      catalogue: {
        models: undefined,
        loading: false,
        error: undefined,
        async fetchModels() {
          throw new Error('must not discover');
        },
      },
      onChange: (next) => {
        draft = next;
      },
      onSaved: (next) => {
        saved = draft = next;
      },
      keyRequest: null,
      onReturn() {},
    });
    const elements: React.ReactElement<Record<string, unknown>>[] = [];
    const visit = (node: React.ReactNode) => {
      if (!React.isValidElement<Record<string, unknown>>(node)) return;
      elements.push(node);
      React.Children.forEach(node.props.children as React.ReactNode, visit);
    };
    visit(tree);
    return elements;
  };
  let form = render('assessment');
  expect(form.some((element) => element.type === ModelField)).toBe(false);
  expect(
    form.find((element) => element.type === Button && element.props.children === 'azureAssessment.check')!.props
      .disabled,
  ).toBe(true);
  (form.find((element) => element.type === KeyField)!.props.onChange as (value: string) => void)('TEST-draft-key');
  form = render('assessment');
  (form.find((element) => element.type === RegionField)!.props.onChange as (value: string) => void)('canadaeast');
  form = render('text');
  (form.find((element) => element.type === ModelField)!.props.onChange as (value: string) => void)(
    'custom-unsaved-text',
  );
  expect(render('assessment').find((element) => element.type === RegionField)!.props.value).toBe('canadaeast');
  let finish!: () => void;
  const check = spyOn(azureAssessment, 'checkKey').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  form = render('assessment');
  const button = form.find((element) => element.type === Button && element.props.children === 'azureAssessment.check')!;
  expect(button.props.disabled).toBe(false);
  (button.props.onClick as () => void)();
  expect(check).toHaveBeenCalledTimes(1);
  expect(check.mock.calls[0][0]).toEqual({ apiKey: 'TEST-draft-key', region: 'canadaeast' });
  (form.find((element) => element.type === RegionField)!.props.onChange as (value: string) => void)('eastus');
  expect(check.mock.calls[0][0].region).toBe('canadaeast');
  expect(check.mock.calls[0][1]?.aborted).toBe(true);
  finish();
  await Bun.sleep(0);
  form = render('ocr');
  (
    form.find((element) => element.type === Button && element.props.children === 'common.save')!.props
      .onClick as () => void
  )();
  expect(getAppSettings().providerRegions.azure).toBe('eastus');
  expect(getAppSettings().textModel).toBe('custom-unsaved-text');
  expect(getAppSettings().apiKeys.azure).toBe('TEST-draft-key');
  expect(sliceOf(draft, 'ai')).toBe(sliceOf(saved, 'ai'));
});
