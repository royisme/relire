import type { Provider, SpeechProvider, TextProvider } from '../types';
import { gemini } from './gemini';

/**
 * Every provider the app can use. To add one, implement `Provider` (text,
 * speech or both), register it here and add its display name under
 * `providers.<id>` in the locale files; the settings screen picks it up.
 */
const PROVIDERS: Provider[] = [gemini];

export const textProviders = () => PROVIDERS.filter((p) => p.text);
export const speechProviders = () => PROVIDERS.filter((p) => p.speech);

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.info.id === id) ?? PROVIDERS[0];
}

export const getTextProvider = (id: string): TextProvider => {
  const provider = getProvider(id);
  if (!provider.text) throw new Error(`Provider "${id}" has no text support`);
  return provider.text;
};

export const getSpeechProvider = (id: string): SpeechProvider => {
  const provider = getProvider(id);
  if (!provider.speech) throw new Error(`Provider "${id}" has no speech support`);
  return provider.speech;
};
