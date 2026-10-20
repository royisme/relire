export interface UsageExample {
  fr: string;
  zh: string;
  en?: string;
  highlight?: string;
}

export interface WordAnalysis {
  word: string;
  lemma: string;
  partOfSpeech: string;
  ipa: string;
  phoneticsGuide: string;
  translation: string;
  translationEn?: string;
  otherMeanings?: string[];
  contextTense?: string;
  usageExamples?: UsageExample[];
  cefrLevel?: string;
  memoryTrick?: string;
}

export interface SyntaxSegment {
  segment: string;
  role: string;
  explanation: string;
}

export interface GrammarPoint {
  title: string;
  explanation: string;
  ruleFormula?: string;
}

export interface PatternCollocation {
  pattern: string;
  meaning: string;
  examples: Array<{ fr: string; zh: string; en?: string }>;
}

export interface ShadowingGuide {
  rhythmGroups: string[];
  liaisons: string[];
  intonation: string;
  speedTip?: string;
}

export interface SentenceAnalysis {
  sentence: string;
  translation: string;
  syntaxStructure: SyntaxSegment[];
  grammarPoints: GrammarPoint[];
  patternCollocations: PatternCollocation[];
  shadowingGuide: ShadowingGuide;
}

export interface PhonemeFeedback {
  phoneme: string;
  targetWord: string;
  status: 'excellent' | 'acceptable' | 'needs_work';
  tip: string;
}

export interface PronunciationCorrection {
  word: string;
  expectedIPA: string;
  actualNote: string;
  advice: string;
}

export interface PronunciationAssessment {
  overallScore: number;
  accuracyScore: number;
  fluencyScore: number;
  rhythmScore: number;
  transcribedSpeech?: string;
  phonemeFeedback: PhonemeFeedback[];
  liaisonFeedback?: string;
  intonationFeedback?: string;
  corrections: PronunciationCorrection[];
  strengths?: string[];
  coachingNotes: string;
  evaluatedAt?: string;
  referenceText?: string;
}

/** The levels an article can carry, as the article editor and the article import offer them. */
export const ARTICLE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export interface Article {
  id: string;
  title: string;
  level: string; // A1, A2, B1, B2, C1
  category: string;
  source?: string;
  content: string;
  createdAt: string;
}

export interface UserStats {
  sentencesAnalyzed: number;
  shadowingSessionsCompleted: number;
  averagePronunciationScore: number;
  pronunciationHistory: Array<{
    date: string;
    text: string;
    score: number;
  }>;
}
