import type { Provider, SpeechProvider, TextProvider } from '../types';
import { anthropic } from './anthropic';
import { device } from './device';
import { azure } from './azure';
import { gemini } from './gemini';
import { fish } from './fish';
import { ollama } from './ollama';
import { openai } from './openai';

/**
 * Every provider the app can use. To add one, implement `Provider` (text,
 * speech or both), register it here and add its display name under
 * `providers.<id>` in the locale files; the settings screen picks it up.
 * `device` is the platform's own voice, offered beside the remote speech providers.
 */
const PROVIDERS: Provider[] = [gemini, openai, anthropic, ollama, fish, device, azure];

export const textProviders = () => PROVIDERS.filter((p) => p.text);
export const speechProviders = () => PROVIDERS.filter((p) => p.speech);
export const assessmentProviders = () => PROVIDERS.filter((p) => p.assessment);

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.info.id === id) ?? PROVIDERS[0];
}

/** A local provider works without a key; every other provider needs one before its features can run. */
export const providerRequiresKey = (id: string) => getProvider(id).info.requiresKey !== false;

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
