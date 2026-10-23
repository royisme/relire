/** A text provider that answers from a queue and records what it was sent. No network. */
import type { JsonRequest, TextConfig, TextProvider } from '../../src/services/ai/types';
import type { TextContext } from '../../src/services/ai/tasks';

export interface FakeProvider extends TextProvider {
  requests: JsonRequest[];
  configs: TextConfig[];
}

/** `imageModels` are the models that read images; every other model is refused. */
export function fakeProvider(answer: unknown, imageModels: string[] = ['vision']): FakeProvider {
  const provider: FakeProvider = {
    requests: [],
    configs: [],
    supportsAudioInput: false,
    imageInputCapability: (model) =>
      imageModels.includes(model) ? 'supported' : model === 'unknown' ? 'unknown' : 'unsupported',
    async generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T> {
      provider.requests.push(request);
      provider.configs.push(config);
      const value = typeof answer === 'function' ? (answer as () => unknown)() : answer;
      if (value instanceof Error) throw value;
      return value as T;
    },
    async checkKey() {},
  };
  return provider;
}

export const contextOf = (provider: TextProvider, model = 'vision', lang: 'en' | 'zh' = 'en'): TextContext => ({
  execution: {
    model,
    supportsAudioInput: provider.supportsAudioInput,
    imageInput: provider.imageInputCapability(model),
    generateJson: (request) => provider.generateJson(request, { apiKey: 'test', model }),
  },
  lang,
});
