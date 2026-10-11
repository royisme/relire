/** Text-based learning annotations; independent of article data and audio timing. */
export const PRONUNCIATION_SCHEMA_VERSION = 1;
export const READER_TOKENIZER_VERSION = 1;
export const MAX_PRONUNCIATION_SOURCE = 2000;

export interface GraphemeRange {
  start: number;
  end: number;
}

export interface PronunciationWord {
  ordinal: number;
  source: string;
  status: 'resolved' | 'unresolved';
  /** One plain IPA string per ordinary spoken syllable. */
  ipa: string[];
  /** Internal grapheme positions; zero and the word length are implicit. */
  boundaries: number[];
  silent: GraphemeRange[];
}

export interface PronunciationConnection {
  left: number;
  right: number;
  type: 'liaison' | 'enchainement';
  sound: string;
  pronounced: GraphemeRange;
}

export interface PronunciationStress {
  word: number;
  syllable: number;
  anchor: GraphemeRange;
}

export interface PronunciationMarkers {
  version: 1;
  source: string;
  words: PronunciationWord[];
  connections: PronunciationConnection[];
  stress: PronunciationStress[];
}

export interface PronunciationLayers {
  connections: boolean;
  stress: boolean;
  silent: boolean;
  syllables: boolean;
}
