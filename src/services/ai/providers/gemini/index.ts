import type { Provider } from '../../types';
import { geminiAcceptsImages, geminiText } from './client';
import { geminiSpeech } from './tts';

const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];

export const gemini: Provider = {
  info: {
    id: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    text: {
      models: TEXT_MODELS,
      defaultModel: 'gemini-2.5-flash',
      imageModels: TEXT_MODELS.filter(geminiAcceptsImages),
    },
    speech: {
      models: ['gemini-3.8-flash-lite-tts'],
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
  text: geminiText,
  speech: geminiSpeech,
};
