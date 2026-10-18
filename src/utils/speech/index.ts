export {
  speakFrench,
  stopSpeech,
  toggleSpeech,
  pauseSpeech,
  resumeSpeech,
  playRecording,
  setBeforePlay,
  testSpeech,
  setGlobalRate,
  getGlobalRate,
  type SpeechOptions,
  type SpeechOutcome,
} from './playback';
export {
  startSequence,
  toggleSequence,
  stepSequence,
  stopSequence,
  suspendSequence,
  getSequenceState,
  subscribeSequence,
  type SequenceState,
} from './sequence';
export {
  getSpeechState,
  getSpeechFailure,
  subscribeSpeech,
  speechKey,
  type SpeechPhase,
  type SpeechState,
  type SpeechFailure,
} from './state';
export { prefetchSpeech } from './clips';
export { FrenchAudioRecorder } from './recorder';
