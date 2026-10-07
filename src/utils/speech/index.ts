export { speakFrench, stopSpeech, toggleSpeech, pauseSpeech, resumeSpeech, testSpeech, setGlobalRate, getGlobalRate, type SpeechOptions, type SpeechOutcome } from './playback';
export { startSequence, toggleSequence, stepSequence, stopSequence, getSequenceState, subscribeSequence, type SequenceState } from './sequence';
export { getSpeechState, subscribeSpeech, speechKey, type SpeechPhase, type SpeechState } from './state';
export { prefetchSpeech } from './clips';
export { FrenchAudioRecorder } from './recorder';
