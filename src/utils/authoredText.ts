/** Picks the interface-language side of an authored bilingual field, falling back only when that side is empty. Owns that choice, not the layout that shows the text. */
import type { Bilingual } from '../types/grammarCheckpoint';

export function authoredText(field: Bilingual, language: string | undefined): string {
  const zh = language?.startsWith('zh') === true;
  const preferred = zh ? field.zh : field.en;
  return preferred.trim() ? preferred : zh ? field.en : field.zh;
}
