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
- Automatic speech (a dictation item after its check) follows `speechAfterCheck`: the Practice preference is the master switch; off, a check says nothing; on, the selected engine speaks once the learner has opted into remote synthesis (or when that engine is the device voice itself), and with the device voice otherwise — an explicit device source that synthesizes and stores nothing. Explicit Listen uses the selected engine except for a drill whose item declares `meta.playbackEngine === 'device'` (reader dictation and spelling-sound drills): Listen uses the device voice, and speech after a check, where it exists, still follows `speechAfterCheck`'s master switch. Never synthesize automatically from a page load or a re-render.
- Vocabulary save/remove/download/reveal/rate never synthesize or prefetch. Review Listen uses the selected engine and stops only its session-owned playback on move/leave; no example audio. Protect/export acquired clips only for bookmarked or scheduled rows (word, personal context sentence, personal usage-example French), never unseen book words or built-in examples.
- Clips are paid for once: `clips.loadSpeech` reads the stored clip first, otherwise synthesizes through `getAiAccess().synthesize` and stores it. Do not call a speech provider directly from UI code.
- The browser voice is an engine, never a fallback: it speaks when the engine chosen in Settings is the device voice — a declared kind of engine (`info.speech.device`) whose `loadSpeech` throws `DeviceVoiceError`, so playback uses the same browser-voice path — or when a caller asks for the device source explicitly (the free automatic replay). Any other failure of synthesis or playback settles `failed` with its real reason in the shared speech state (the control that started it shows it), and the device voice honestly fails when the platform has no French voice. The settings preview (`testSpeech`) synthesizes the draft directly instead of reading a stored clip, so a cached clip cannot pass for a check, and it reports failure rather than falling back. The preview is a sound like any other: it plays through the single-playback slot, is interrupted by any new playback or stop, and is cancelled with its request (sound included) when Settings is left or an edit invalidates the check.
- Recordings play through `playRecording(blob, 'take:<id>')`, so they share the speech state and replace any other clip. `setBeforePlay` lets the practice card interrupt its take before anything plays; recording pauses an article sequence with `suspendSequence` instead of ending it.
- One microphone user at a time: `claimCapture(owner, cancel)` before `getUserMedia`, `releaseCapture` when done; `cancelCapture` stops the other holder. Throw the browser's real error.
- Read records and checks only in `usePracticeCard` (reader card), while Speaking and sound-pairs read-aloud keep `useShadowingRecorder`: changing the reference or unmounting must release capture and playback resources and cancel assessment.
