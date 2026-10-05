export interface ConjugationForm {
  person: string;
  form: string;
}

export interface ConjugationTense {
  tense: string;
  forms: ConjugationForm[];
}

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
  conjugationTable?: ConjugationTense[];
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
  examples: Array<{ fr: string; zh: string }>;
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

export interface ReviewRecord {
  date: string;
  rating: number; // 0-5 (0: Blackout, 3: Pass, 5: Perfect)
  intervalDays: number;
  easeFactor: number;
}

export interface VocabWord {
  id: string;
  word: string;
  lemma: string;
  ipa: string;
  translation: string;
  translationEn?: string;
  partOfSpeech: string;
  contextSentence: string;
  contextTense?: string;
  phoneticsGuide?: string;
  phoneticsGuideEn?: string;
  addedAt: string;
  // SM-2 Spaced Repetition parameters
  repetitions: number;
  intervalDays: number;
  easeFactor: number; // default 2.5
  nextReviewDate: string; // ISO date string YYYY-MM-DD
  lastReviewedAt?: string;
  reviewHistory: ReviewRecord[];
  tags?: string[];
}

export interface Article {
  id: string;
  title: string;
  level: string; // A1, A2, B1, B2, C1
  category: string;
  source?: string;
  content: string;
  createdAt: string;
}

export interface PracticeQuestion {
  id: number;
  type: 'scramble' | 'cloze' | 'oral_prompt' | 'translation';
  targetSentence: string;
  prompt: string;
  scrambledChunks?: string[];
  clozeText?: string;
  options?: string[];
  correctOptionIndex?: number;
  grammarHint?: string;
  shadowingAudioPrompt?: string;
}

export interface PracticeDeck {
  title: string;
  description: string;
  questions: PracticeQuestion[];
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
