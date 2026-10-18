import type { Provider } from '../../types';
import { anthropicText } from './client';
import { ANTHROPIC_DEFAULT_BASE_URL, ANTHROPIC_TEXT_MODELS, anthropicCatalogue } from './models';

/** Claude writes and reads pages with the learner's own key; its host is overridable like the other providers. */
export const anthropic: Provider = {
  info: {
    id: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultBaseUrl: ANTHROPIC_DEFAULT_BASE_URL,
    text: {
      // The default is the source registry's vision-capable entry, so image reading works out of the box.
      models: ANTHROPIC_TEXT_MODELS,
      defaultModel: 'claude-3-7-sonnet-latest',
      imageModels: ANTHROPIC_TEXT_MODELS,
    },
  },
  catalogue: anthropicCatalogue,
  text: anthropicText,
};
