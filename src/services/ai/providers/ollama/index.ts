import type { Provider } from '../../types';
import { ollamaText } from './client';
import { OLLAMA_DEFAULT_BASE_URL, OLLAMA_DEFAULT_MODEL, OLLAMA_TEXT_MODELS, ollamaCatalogue } from './models';

/** Ollama answers from the learner's own machine: no key, no cost, and no text leaving the device. */
export const ollama: Provider = {
  info: {
    id: 'ollama',
    // The page that explains how a local server is told to accept this origin.
    keyUrl:
      'https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-allow-additional-web-origins-to-access-ollama',
    defaultBaseUrl: OLLAMA_DEFAULT_BASE_URL,
    requiresKey: false,
    text: { models: OLLAMA_TEXT_MODELS, defaultModel: OLLAMA_DEFAULT_MODEL },
  },
  catalogue: ollamaCatalogue,
  text: ollamaText,
};
