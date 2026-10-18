import type { Provider } from '../../types';
import { openaiText } from './client';
import { OPENAI_DEFAULT_BASE_URL, OPENAI_IMAGE_MODELS, OPENAI_TEXT_MODELS, openaiCatalogue } from './models';

export const openai: Provider = {
  info: {
    id: 'openai',
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultBaseUrl: OPENAI_DEFAULT_BASE_URL,
    text: {
      models: OPENAI_TEXT_MODELS,
      defaultModel: 'gpt-4o-mini',
      imageModels: OPENAI_IMAGE_MODELS,
    },
  },
  catalogue: openaiCatalogue,
  text: openaiText,
};
