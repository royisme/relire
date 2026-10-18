import type { Provider } from '../../types';
import { FISH_DEFAULT_MODEL, FISH_SPEECH_MODELS, fishCatalogue } from './models';
import { fishSpeech } from './tts';

/** Fish Audio speaks French with the learner's own key; its fixed endpoint has no Base URL field. */
export const fish: Provider = {
  info: {
    id: 'fish-audio',
    keyUrl: 'https://fish.audio/app/api-keys/',
    speech: {
      models: FISH_SPEECH_MODELS,
      defaultModel: FISH_DEFAULT_MODEL,
      // Fish takes any reference id (or none for the model's default voice), so this list stays empty.
      voices: [],
      defaultVoice: '',
    },
  },
  catalogue: fishCatalogue,
  speech: fishSpeech,
};
