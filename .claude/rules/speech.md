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
- Chaining clips goes through `sequence.ts` and `onSettled` (`ended`, `interrupted`, `failed`, called once per clip). A sequence bumps its own token on every move, so callbacks from a replaced clip are ignored; anything else that starts speech interrupts and ends the sequence. Synthesize only what is about to play (the current sentence, then two ahead).
- Reader and listener must cut sentences the same way: use `utils/sentences.ts`, never a local regex.
- Clips are paid for once: `clips.loadSpeech` reads the stored clip first, otherwise synthesizes and stores it. Do not call a speech provider directly from UI code.
- The browser voice is only a fallback when the provider fails; `testSpeech` in Settings reports failure instead of falling back.
- Recording lives in `useShadowingRecorder`: changing the reference text or unmounting must close the microphone, stop speech recognition and revoke object URLs.
