import type { Provider } from '../../types';
import { geminiText } from './client';
import { GEMINI_TEXT_MODELS, GEMINI_SPEECH_MODELS, geminiCatalogue } from './models';
import { geminiSpeech } from './tts';

export const gemini: Provider = {
  info: {
    id: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    text: {
      models: GEMINI_TEXT_MODELS,
      defaultModel: 'gemini-2.5-flash',
      imageModels: GEMINI_TEXT_MODELS,
    },
    speech: {
      models: GEMINI_SPEECH_MODELS,
      defaultModel: 'gemini-3.8-flash-lite-tts',
      voices: [
        { id: 'Kore', gender: 'female' },
        { id: 'Charon', gender: 'male' },
        { id: 'Zephyr', gender: 'female' },
        { id: 'Puck', gender: 'male' },
      ],
      defaultVoice: 'Kore',
    },
  },
  catalogue: geminiCatalogue,
  text: geminiText,
  speech: geminiSpeech,
};
