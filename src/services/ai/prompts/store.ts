import type { Lang } from '../types';
import { getPromptDefinition, PROMPTS, type PromptId } from './registry';

/**
 * The user's edits to prompts, kept apart from the shipped defaults so a reset
 * is always possible. Small and needed synchronously, so it lives in localStorage.
 */

const KEY = 'relire_prompts_v1';

export type PromptOverrides = Partial<Record<PromptId, Partial<Record<Lang, string>>>>;

export function getPromptOverrides(): PromptOverrides {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function savePromptOverrides(overrides: PromptOverrides): void {
  // An override equal to the default is no override.
  const clean: PromptOverrides = {};
  for (const def of PROMPTS) {
    for (const lang of ['en', 'zh'] as const) {
      const text = overrides[def.id]?.[lang];
      if (typeof text === 'string' && text.trim() && text !== def.defaults[lang]) {
        (clean[def.id] ??= {})[lang] = text;
      }
    }
  }
  try {
    if (Object.keys(clean).length) localStorage.setItem(KEY, JSON.stringify(clean));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: edits last until the page closes.
  }
}

/** The template that will be sent: the user's, or the default. */
export function getPromptTemplate(id: PromptId, lang: Lang): string {
  return getPromptOverrides()[id]?.[lang] ?? getPromptDefinition(id).defaults[lang];
}

export const isPromptCustomized = (id: PromptId, lang: Lang) => getPromptOverrides()[id]?.[lang] !== undefined;
