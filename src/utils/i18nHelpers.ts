import i18n from '../i18n';

/**
 * Helper utilities for formatting levels, sources, and localized strings
 */

export function formatLevel(level: string | undefined, lang: string): string {
  if (!level) return '';
  const code = level.match(/(A1|A2|B1|B2|C1|C2)/i)?.[1]?.toUpperCase();
  if (code) return i18n.t(`levels.${code}`, { lng: lang });
  // Free-text level: in English mode drop any Chinese characters.
  return lang === 'en' ? level.replace(/[\u4e00-\u9fa5]/g, '').trim() : level;
}

export function cleanArticleTitle(title: string | undefined): string {
  if (!title) return '';
  // Strip trailing redundant level badges in parentheses like " (A1 入门)" or " (B1 经典文学)"
  return title.replace(/\s*\((?:A1|A2|B1|B2|C1|C2)[^)]*\)$/i, '').trim();
}
