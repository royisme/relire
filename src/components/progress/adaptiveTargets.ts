/** Splits the translated weak-tag sentence into text and locale-ordered label slots; no rich-text parser. */
export const TARGETS_MARKER = '\u0000';
type TargetPart = { type: 'text'; value: string } | { type: 'tag'; index: number };

export function adaptiveTargetParts(sentence: string, labels: string[], language: string): TargetPart[] {
  const [before, after] = sentence.split(TARGETS_MARKER);
  let index = 0;
  return [
    { type: 'text', value: before },
    ...new Intl.ListFormat(language, { style: 'long', type: 'conjunction' })
      .formatToParts(labels)
      .map((part): TargetPart =>
        part.type === 'element' ? { type: 'tag', index: index++ } : { type: 'text', value: part.value },
      ),
    { type: 'text', value: after },
  ];
}
