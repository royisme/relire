/** Sounds of standard French in the International Phonetic Alphabet, with one common example word each. */
export interface IpaSound {
  symbol: string;
  word: string;
}

export type IpaGroup = 'vowels' | 'nasals' | 'semivowels' | 'consonants';

export const FRENCH_IPA: Record<IpaGroup, IpaSound[]> = {
  vowels: [
    { symbol: 'i', word: 'midi' },
    { symbol: 'e', word: 'été' },
    { symbol: 'ɛ', word: 'mère' },
    { symbol: 'a', word: 'chat' },
    { symbol: 'ɑ', word: 'pâte' },
    { symbol: 'ɔ', word: 'porte' },
    { symbol: 'o', word: 'beau' },
    { symbol: 'u', word: 'roue' },
    { symbol: 'y', word: 'rue' },
    { symbol: 'ø', word: 'peu' },
    { symbol: 'œ', word: 'peur' },
    { symbol: 'ə', word: 'le' },
  ],
  nasals: [
    { symbol: 'ɑ̃', word: 'enfant' },
    { symbol: 'ɛ̃', word: 'vin' },
    { symbol: 'ɔ̃', word: 'bon' },
    { symbol: 'œ̃', word: 'brun' },
  ],
  semivowels: [
    { symbol: 'j', word: 'pied' },
    { symbol: 'w', word: 'oui' },
    { symbol: 'ɥ', word: 'huit' },
  ],
  consonants: [
    { symbol: 'p', word: 'pain' },
    { symbol: 'b', word: 'bain' },
    { symbol: 't', word: 'table' },
    { symbol: 'd', word: 'dame' },
    { symbol: 'k', word: 'café' },
    { symbol: 'g', word: 'gare' },
    { symbol: 'f', word: 'fou' },
    { symbol: 'v', word: 'vous' },
    { symbol: 's', word: 'sac' },
    { symbol: 'z', word: 'rose' },
    { symbol: 'ʃ', word: 'chat' },
    { symbol: 'ʒ', word: 'jour' },
    { symbol: 'm', word: 'mer' },
    { symbol: 'n', word: 'nuit' },
    { symbol: 'ɲ', word: 'agneau' },
    { symbol: 'l', word: 'lune' },
    { symbol: 'ʁ', word: 'rue' },
  ],
};
