---
paths:
  - "src/utils/speech/**"
  - "src/components/ui/speak-button.tsx"
  - "src/components/shadowing/**"
  - "src/hooks/useShadowingRecorder.ts"
  - "src/components/ArticlePlayer.tsx"
  - "src/utils/sentences.ts"
---

# Speech and recording rules

- Playback state has one source: `utils/speech/state.ts` (`idle | loading | playing | paused` plus the normalized text). Only `playback.ts` writes it.
- `speakFrench` / `stopSpeech` bump a request id; work that finishes after being stopped or replaced must stay silent. Keep that guard in any new async path.
- Chaining clips goes through `sequence.ts` and `onSettled` (`ended`, `interrupted`, `failed`, called once per clip). A sequence bumps its own token on every move, so callbacks from a replaced clip are ignored; anything else that starts speech interrupts and ends the sequence. Synthesize only what is about to play (the current sentence, then two ahead), and never while paused: `prefetchSpeech` checks its guard before each request, and resuming restarts the skipped prefetch.
- Reader and listener must cut sentences the same way: use `utils/sentences.ts`, never a local regex.
- Automatic speech (a dictation item after its check) is gated by `maySpeakAfterCheck`: the Practice preference plus, for a remote engine, the learner's explicit opt-in. Off, a check says nothing; the device engine costs nothing and needs no opt-in. Never synthesize automatically from a page load or a re-render.
- Clips are paid for once: `clips.loadSpeech` reads the stored clip first, otherwise synthesizes through `getAiAccess().synthesize` and stores it. Do not call a speech provider directly from UI code.
- The browser voice speaks in exactly two cases: the engine chosen in Settings is the device voice, which is a declared kind of engine (`info.speech.device`) and never a fallback — `loadSpeech` throws `DeviceVoiceError` and playback uses the same browser-voice path — or a remote provider failed on its own request. A remote provider's error is reported, never replaced by the device voice. The settings preview (`testSpeech`) synthesizes the draft directly instead of reading a stored clip, so a cached clip cannot pass for a check, and it reports failure rather than falling back.
- Recordings play through `playRecording(blob, 'take:<id>')`, so they share the speech state and replace any other clip. `setBeforePlay` lets the practice card interrupt its take before anything plays; recording pauses an article sequence with `suspendSequence` instead of ending it.
- One microphone user at a time: `claimCapture(owner, cancel)` before `getUserMedia`, `releaseCapture` when done; `cancelCapture` stops the other holder. Throw the browser's real error.
- Recording lives in `useShadowingRecorder` (sentence sheet, Practice) and `usePracticeCard` (reader card): changing the reference text or unmounting must close the microphone, stop speech recognition and revoke object URLs.
