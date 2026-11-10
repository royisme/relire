/** The fourth purpose routes only to Azure assessment, with immutable local key/region snapshots. */
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { createByokAccess } from '../src/services/ai/access';
import { assessmentProviders, speechProviders, textProviders } from '../src/services/ai/providers';
import { azureAssessment } from '../src/services/ai/providers/azure/client';
import { purposeCapability } from '../src/services/ai/catalogue';
import { getAppSettings } from '../src/utils/appSettings';
import type { AssessmentRequest } from '../src/services/ai/types';

afterEach(() => mock.restore());
const request: AssessmentRequest = { pcm: new Int16Array([1]), referenceText: 'Bonjour', locale: 'fr-FR' };
const scores = { overallScore: 0, accuracyScore: 0, fluencyScore: 0 };

test('Azure is the model-less default but never appears in text/OCR/TTS provider lists', () => {
  const settings = getAppSettings();
  expect(settings.assessmentProvider).toBe('azure');
  expect(settings.assessmentModel).toBe('');
  expect(createByokAccess(settings).isConfigured('assessment')).toBe(false);
  expect(assessmentProviders().map((provider) => provider.info.id)).toEqual(['azure']);
  expect(textProviders().map((provider) => provider.info.id)).not.toContain('azure');
  expect(speechProviders().map((provider) => provider.info.id)).not.toContain('azure');
  const selected = createByokAccess(settings).selection('assessment');
  expect(selected).toEqual({
    providerId: 'azure',
    model: '',
    capabilities: {
      textGeneration: 'unsupported',
      imageInput: 'unsupported',
      speechOutput: 'unsupported',
    },
  });
  expect(purposeCapability(selected.capabilities, 'assessment')).toBe('unsupported');
});

test('readiness requires both key and syntactically valid region, not a made-up model', () => {
  for (const [key, region, ready] of [
    ['', '', false],
    [' ', 'canadaeast', false],
    ['TEST-only-key', '', false],
    ['TEST-only-key', 'bad region', false],
    ['TEST-only-key', ' canadaeast ', true],
  ] as const) {
    const access = createByokAccess({
      ...getAppSettings(),
      apiKeys: { azure: key },
      providerRegions: { azure: region },
    });
    expect(access.isConfigured('assessment')).toBe(ready);
  }
});

test('assessment and explicit Check use the same pinned provider/key/region, no endpoint or model', async () => {
  const assess = spyOn(azureAssessment, 'assess').mockResolvedValue(scores);
  const check = spyOn(azureAssessment, 'checkKey').mockResolvedValue();
  const settings = {
    ...getAppSettings(),
    apiKeys: { azure: ' TEST-only-key ' },
    providerRegions: { azure: 'canadaeast' },
    baseUrls: { azure: 'https://not-used.test' },
  };
  const before = [settings.textModel, settings.ocrModel, settings.speechModel];
  const access = createByokAccess(settings);
  settings.apiKeys.azure = 'edited-key';
  settings.providerRegions.azure = 'eastus';
  settings.assessmentProvider = 'gemini';
  expect(await access.assess(request)).toEqual(scores);
  expect(assess).toHaveBeenCalledWith(request, { apiKey: 'TEST-only-key', region: 'canadaeast' });
  const controller = new AbortController();
  await access.checkConnection('assessment', controller.signal);
  expect(check).toHaveBeenCalledWith({ apiKey: 'TEST-only-key', region: 'canadaeast' }, controller.signal);
  expect([settings.textModel, settings.ocrModel, settings.speechModel]).toEqual(before);
  expect(() => access.listModels('assessment')).toThrow();
});
