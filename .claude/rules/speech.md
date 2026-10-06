---
paths:
  - "src/utils/speech/**"
  - "src/components/ui/speak-button.tsx"
  - "src/components/shadowing/**"
  - "src/hooks/useShadowingRecorder.ts"
---

# Speech and recording rules

- Playback state has one source: `utils/speech/state.ts` (`idle | loading | playing` plus the normalized text). Only `playback.ts` writes it.
- `speakFrench` / `stopSpeech` bump a request id; work that finishes after being stopped or replaced must stay silent. Keep that guard in any new async path.
- Clips are paid for once: `clips.loadSpeech` reads the stored clip first, otherwise synthesizes and stores it. Do not call a speech provider directly from UI code.
- The browser voice is only a fallback when the provider fails; `testSpeech` in Settings reports failure instead of falling back.
- Recording lives in `useShadowingRecorder`: changing the reference text or unmounting must close the microphone, stop speech recognition and revoke object URLs.
