/**
 * Helper utilities for formatting levels, sources, and localized strings
 */

export function formatLevel(level: string | undefined, lang: string): string {
  if (!level) return '';
  const isEn = lang === 'en';
  const match = level.match(/(A1|A2|B1|B2|C1|C2)/i);
  const code = match ? match[1].toUpperCase() : '';

  if (!code) {
    if (isEn) {
      // Remove any Chinese characters if displayed in English mode
      return level.replace(/[\u4e00-\u9fa5]/g, '').trim();
    }
    return level;
  }

  switch (code) {
    case 'A1':
      return isEn ? 'A1 · Beginner' : 'A1 · 入门';
    case 'A2':
      return isEn ? 'A2 · Elementary' : 'A2 · 初级';
    case 'B1':
      return isEn ? 'B1 · Intermediate' : 'B1 · 进阶中级';
    case 'B2':
      return isEn ? 'B2 · Upper Intermediate' : 'B2 · 高级中等';
    case 'C1':
      return isEn ? 'C1 · Advanced' : 'C1 · 高阶专业';
    case 'C2':
      return isEn ? 'C2 · Mastery' : 'C2 · 精通母语';
    default:
      return code;
  }
}

export function formatArticleSource(source: string | undefined, lang: string): string {
  if (!source) return '';
  const isEn = lang === 'en';
  const lower = source.toLowerCase();

  if (
    source.includes('用户自拟') ||
    source.includes('剪贴板') ||
    lower.includes('presse-papier') ||
    lower.includes('clipboard')
  ) {
    return isEn ? 'User / Clipboard' : '用户自拟 / 剪贴板';
  }

  if (isEn) {
    if (source.includes('自拟') || source.includes('自建')) return 'Custom Text';
  }

  return source;
}

export function cleanArticleTitle(title: string | undefined): string {
  if (!title) return '';
  // Strip trailing redundant level badges in parentheses like " (A1 入门)" or " (B1 经典文学)"
  return title.replace(/\s*\((?:A1|A2|B1|B2|C1|C2)[^)]*\)$/i, '').trim();
}
