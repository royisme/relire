import type { Provider } from '../../types';
import { geminiText } from './client';
import { geminiSpeech } from './tts';

export const gemini: Provider = {
  info: {
    id: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    text: {
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'],
      defaultModel: 'gemini-2.5-flash',
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
