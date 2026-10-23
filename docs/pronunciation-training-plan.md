# Pronunciation training: proposal

Status: **proposal for owner sign-off. Nothing is built.** Adapted from a plan written for a sibling project (`my-tanstack-app/docs/59-speeches-plan.md`, v0.1, 2026-10-21), checked against Relire's rules and code and against Microsoft Learn on 2026-10-21.

## 1. Goal and non-goals

A short loop for sounds Chinese-speaking learners often confuse: **hear a contrast, tell it apart, say it, compare, repeat**. The value is the correction and the repetition. A score is only an aid. The plan reuses what Relire already has.

Goals:
- Minimal-pair listening drills with real, computed accuracy per sound contrast.
- Read-aloud practice for the same words, using the recorder and assessor that already exist.
- An honest record of which contrasts the learner still gets wrong (counts from real attempts only).

Non-goals:
- No server, account, sync or cloud storage of recordings or keys.
- No exam-readiness claim. No claim that any score predicts a TCF result.
- No acoustic analysis (formants, Praat), no own speech model, no isolated-phoneme scoring.
- No mastery thresholds in v1 (see 6).

## 2. What already exists and is reused

| Need | Existing piece |
| --- | --- |
| Record, stop, play back, one mic owner | `src/utils/speech/recorder.ts` (capture lock, MediaRecorder: webm/opus, mp4 or ogg), `src/hooks/useShadowingRecorder.ts`, `src/hooks/usePracticeCard.ts` |
| Read-aloud UI with optional AI check | `src/components/shadowing/ShadowingRecorder.tsx`, `AssessmentResult.tsx`; used by `SentenceDrawer.tsx` and `practice/OralPractice.tsx` (the "Read aloud" section of Practice) |
| AI assessment | `api.assessPronunciation` (`src/services/api.ts:168`) to `tasks.assessPronunciation` (`src/services/ai/tasks.ts:68`), prompts `pronunciation-audio.*.txt` / `pronunciation-text.*.txt`. Audio is sent only when the text provider has `supportsAudioInput` (Gemini only today). Never cached |
| Kept recordings, compare with reference | `src/storage/shadowing.ts` (3 takes per sentence, article or passage owner), My study → Shadowing log |
| Reference audio | `clips.loadSpeech` through `getAiAccess().synthesize`, stored in IndexedDB `audio`; or the device voice |
| French sound inventory with tap-to-hear examples | `src/data/frenchIpa.ts`, the IPA chart in Progress (`AnalyticsDashboard.tsx`) |
| Drills with attempts, Mistakes and accuracy | `ExerciseUnit` / `saveUnits` / `checkItem` (`src/storage/exercises.ts`), tag `listening-dictation` (`src/types/grammar.ts`), NUMBER_DICTATION's Listen control |
| Precedent for a reviewed local pack and no-key drills | Noun gender: `data/noun-gender/`, `src/services/nounGender/`, GENDER_CHECK drills |
| Text pronunciation hints | Reader pronunciation markers (`docs/pronunciation-markers-design.md`) |

## 3. Changes from the source plan

| Source plan | Here | Why |
| --- | --- | --- |
| Loop: listen, record, assess, correct, repeat | **Kept** | It fits core job 5 in `PRODUCT.md` |
| "Scoring is an aid, correction and repetition are the value" | **Kept** | Matches "show real data or nothing" |
| Minimal-pair contrasts (e/ɛ, y/u, b/p, nasal/oral) | **Kept**, with real minimal pairs. All pairs need language review | The source's example `été` / `être` is not a minimal pair |
| Listening accuracy computed from answers; isolated phoneme scores not trusted | **Kept** | Deterministic and honest |
| Cloudflare Worker for auth and short-lived tokens | **Dropped** | The key would pass through a server. That breaks `CLAUDE.md:3` and ADR `docs/adr-hosted-content-service.md:53` ("never receives a key ... or a recording"). A token service is also pointless when the learner's own key is already in their browser |
| D1 for exercises, attempts, progress | **Dropped**, moved to IndexedDB | Learner data is client-only (`.claude/rules/storage.md`). The content service is read-only and has no write endpoint (ADR section 3) |
| "Reuse existing auth / private access" | **Dropped** | There are no accounts. H4 is deferred (`docs/roadmap.md:53`) |
| "TanStack front end" | **Corrected** | Relire has no router dependency (`docs/architecture.md:90`). It only uses `@tanstack/react-table` |
| Azure Speech JS SDK as the assessor | **Changed** to an option that needs the owner's decision (section 7) | It would be a new provider and maybe a new dependency. Both are owner decisions under `CLAUDE.md` |
| `PronunciationProvider` abstraction from day one | **Dropped for now** | No second caller exists. `TextProvider.generateJson` with audio already carries assessment |
| Pre-generated Azure TTS in static files or R2 | **Dropped** | Reference audio uses the learner's chosen speech engine and is cached in IndexedDB. Shipped audio would need licensing and a new asset pipeline |
| Score thresholds 85 / 70 | **Dropped from v1** | No calibration data exists. The source says so itself. Thresholds come back only after a measured trial (phase 3) |
| Seed content, never LLM-generated IPA | **Kept**, as a reviewed static pack (noun-gender precedent) | Never invent data |
| Phase 0 PoC before building | **Kept**, done in the Microsoft Foundry portal with no Relire code | Cheapest way to test whether fr-FR phoneme scores are useful |
| Later Python or Praat service | **Dropped** | A server of our own is out of scope |

## Owner decisions (2026-10-21)

- **Scoring provider:** Azure pronunciation assessment through the `microsoft-cognitiveservices-speech-sdk` package, with the learner's own key and region entered in Settings. The owner supplies the key. The SDK is accepted as a new dependency (section 7, option C).
- **Stack, a correction:** Relire is a Vite + React 19 static app with hash routing and `@tanstack/react-table` only (`package.json`; `docs/architecture.md` "Navigation and routes": no router dependency). The source plan's "TanStack front end" describes the sibling project `my-tanstack-app`, which has TanStack Router and Query. Moving Relire to TanStack Router or Query would be a separate migration decision and is not part of this plan; new screens follow the current routing and component rules.

## 4. Technical claims checked

Verified on Microsoft Learn (2026-10-21):
- Pronunciation assessment supports `fr-FR` and `fr-CA` (33 locales). Source: language-support, pronunciation-assessment tab.
- Phoneme **names** are returned only for `en-US` (IPA) and `en-US`/`zh-CN` (SAPI). Other locales get "only the phoneme score". Syllable groups and spoken-phoneme n-best are `en-US` only. Source: how-to-pronunciation-assessment, "Supported features per locale".
- Prosody assessment is `en-US` only and is billed as an add-on. Accuracy, fluency, completeness and miscue are billed at the speech-to-text baseline. Source: same page and pronunciation-assessment-tool "Pricing".
- F0 gives 5 audio hours of real-time speech to text per month. F0 allows **1 concurrent request**, and this limit cannot be raised. Source: pricing page; quotas-and-limits.
- REST for short audio: at most 30 s of audio for pronunciation assessment. Input must be WAV PCM 16 kHz mono or `audio/ogg; codecs=opus`. Assessment settings travel in a base64 JSON `Pronunciation-Assessment` header. The key goes in `Ocp-Apim-Subscription-Key`, or a bearer token from `issueToken` (valid 10 minutes). Source: rest-speech-to-text-short.

Not verified (marked UNVERIFIED):
- Whether the fr-FR phoneme scores line up one-to-one, in order, with our IPA for a word. Azure's French phone set is not published with names.
- Whether the short-audio REST endpoint allows browser CORS requests. The JS SDK is documented for browsers, but its CORS behaviour was not checked.
- Whether fr-FR scores separate e/ɛ or y/u reliably, and whether slow beginner speech is under-scored. The source plan raises this too.
- Whether Chrome's `webkitSpeechRecognition`, which `useShadowingRecorder.ts:139-148` starts automatically during every assessed recording, sends audio to Google servers in current versions. It was server-based historically. This matters for the privacy statement.
- Whether synthesized voices (Gemini TTS, Fish, device voices) say isolated words such as `fée` / `fait` with the intended vowel.

Two existing honesty issues found while reviewing. Both are separate from this plan and should be tracked as issues:
- `src/services/ai/prompts/index.ts:92` sets `transcript` to the **reference text** when the browser gave no transcript. A text-only provider is then asked to score a reading it never heard (`pronunciation-text.en.txt`). That conflicts with "never invent scores".
- Both assessment templates show concrete example numbers (`"overallScore": 88`, `86`), which can anchor the model's answers.

## 5. Smallest first slice: listening contrasts, no scoring

1. **Content pack** `data/minimal-pairs/`, reviewed and then bundled as `src/data/minimal-pairs/*.json`, Zod-validated at load with review status, like noun gender. Each pair has: contrast id (two symbols from `frenchIpa.ts`), word A, word B, and an optional reviewed note. **No per-word IPA in v1**, because none is reviewed yet.
2. **Drill**: Practice → Add exercises → "Sound pairs" (beside conjugation drills). The learner picks contrasts and a count, and one standalone set is saved through `saveUnits` with no AI and no key. Each item plays one word of a pair, and the learner picks which word it was. Item: `CHOICE_SELECT`, `options: [A, B]`, `audioText` = the target word, `grammarTag: 'listening-dictation'`, `meta.contrast: '<id>'`. The only UI change is a Listen button in the choice control when an item has `audioText` (reuses `SpeakButton`). Implementation must confirm this stays within the AI exercise schemas.
3. **Say it**: after a check, the item offers "Read aloud" for both words with the existing `ShadowingRecorder` (play back, optional AI check). Nothing new is stored.
4. **Per-contrast counts** come from existing attempts grouped by `meta.contrast`. They show as plain correct/total figures in Progress beside the IPA chart. No new store.

What this slice does not do: no new provider, no stored drill recordings, no thresholds, no backend.

## 6. Data, storage and backup

- **Drills, items, attempts**: existing `units`, `itemStates`, `attempts`. Always backed up, so per-contrast history survives a restore.
- **Pairs pack**: static, versioned in the repo. It is content, not learner data, so it is never backed up. The owner may later choose to host it in the content service (ADR Q4). That request would carry only a pack id.
- **Recordings**: slice 1 keeps none (the existing `ShadowingRecorder` holds one object URL and revokes it). If kept drill takes are wanted later, `shadowing` needs a third owner kind (`drill: { unitId }`). That is a data-shape change that waits for the owner's decision. It would follow the existing rules: optional in backup, absent key keeps, `[]` clears, malformed rejects.
- **Keys**: any assessment key lives with the others in `relire_app_settings_v1` and is **never** in a backup.
- **Assessment results**: never cached. If phase 3 stores raw provider JSON per attempt, it goes on the attempt row (backed up). It is never sent anywhere.

## 7. How scoring would be obtained

Options, with defaults:
- **A. None** (slice 1). Listening accuracy is computed. Speaking is self-compared by playing back the take after the reference.
- **B. The existing AI assessor** (Gemini with audio). It exists and needs no new provider, but its numbers are an LLM judgement, not a calibrated measure. The UI must say "estimate". It must refuse to score without audio once the `index.ts:92` issue is fixed.
- **C. Azure pronunciation assessment as a new provider.** This needs the owner's decision (`add-ai-provider` skill). It would add a new purpose `assessment` in `access.ts`, so text, OCR, speech and assessment each choose their own provider. The learner's own Azure key and region live in the browser. The browser uses the `microsoft-cognitiveservices-speech-sdk` package (accepted by the owner 2026-10-21), loaded with a dynamic `import()` so the main chunk does not grow; the real size is to be measured, UNVERIFIED. **No Worker and no token exchange.** The learner's key and region are stored like the other provider keys and never enter a backup. The SDK reads audio from a push stream of 16 kHz mono PCM, so the stored take (webm/mp4) is decoded locally with Web Audio first; whether that works in every target browser is UNVERIFIED. The SDK's own microphone input is not used: Relire records through `useShadowingRecorder` under `claimCapture`, and the take is assessed after recording. The result maps to `PronunciationAssessment` only where fields really exist: the overall score, accuracy and fluency, optional completeness, and per-word accuracy and error type, shown in the result as plain numbers and error labels without phoneme scores (owner decision 2026-10-22). Rhythm, intonation and coaching text are left empty, never filled in. Request limits: the learner's own key means the quota is theirs alone, but the SDK does not enforce any limit. F0 allows one concurrent request per resource and 5 audio hours a month. The provider therefore runs one assessment at a time (a single-flight queue inside the provider) and shows the provider's real error, including a 429 or an exhausted monthly quota. It never retries silently.

Owner decision 2026-10-21: C is approved with the SDK and the learner's own key. Slice 1 (A) and C are independent, so neither waits for the other. Phase 0 remains the way to learn whether fr-FR scores separate the target contrasts; until it is done the UI labels scores as estimates. Default: **A for slice 1, B as it is today, C as phase 3.**

## 8. Content for contrast drills

These are candidate pairs. **Every pair below is UNVERIFIED and must be checked by a language reviewer** (real words, true minimal pair, the same pronunciation in the target accent). No IPA is given beyond the contrast symbols already in `frenchIpa.ts`.

| Contrast | Candidate pairs (UNVERIFIED) | Reviewer note |
| --- | --- | --- |
| y / u | rue / roue, vu / vous, tu / tout, dessus / dessous | High value for Chinese speakers |
| ɑ̃ / ɔ̃ | vent / vont, temps / thon, sans / son | Check that the selected voice keeps them apart |
| e / ɛ | fée / fait, dé / dais, j'irai / j'irais | Many speakers merge this pair in open syllables. Quebec usage differs. Mark it as a tendency |
| ɔ̃ / o (nasal / oral) | bon / beau, son / seau | |
| ɛ̃ / ɛ | faim / fait, vin / vais | |
| b / p | bain / pain, boire / poire, bas / pas | French p is unaspirated. Say so in the note, not as a score |
| ʁ / l | rire / lire, roi / loi | |

Rules: only reviewed pairs ship, as in the noun-gender gate. A pair with a regional split carries a reviewed note and is never presented as universal. No AI generates pairs, notes or IPA at runtime.

## 9. UI placement

- Drill creation: Practice → Add exercises dialog (existing). Drills are ordinary sets: they appear in the Practice table, open as sheets, and wrong answers go to Mistakes.
- Per-contrast figures: Progress, under the existing IPA chart, as plain counts. Empty means empty.
- No new route or nav entry in slice 1. Strings go through `t()` in `en.json` and `zh.json`. Components are shadcn first. Controls never move the page: Listen shows loading and playing on its own icon.

## 10. Privacy statement (for About and the drill dialog)

"Your recordings stay on this device. A recording leaves it only when you press Check pronunciation. It then goes to the provider you chose in Settings, in that one request: today the text AI request in `assessPronunciation` (audio is attached only if the provider can listen). With option C it would be the Azure speech-to-text request. Relire's content service never receives a recording, a key or an answer. Your browser's own speech recognition may also process audio while you record. That depends on your browser." The last sentence stays until the Web Speech question in section 4 is settled, or recognition is removed or made opt-in.

## 11. Phases and acceptance

| Phase | Scope | Acceptance |
| --- | --- | --- |
| 0 | Owner tries fr-FR (and fr-CA) assessment in the Microsoft Foundry portal with their own key: about 20 words from section 8, read correctly and deliberately swapped, plus 10 short sentences. Raw JSON saved locally, never committed | Written finding: do word or phoneme scores drop when a contrast is swapped, and by how much. This decides option C |
| 1 | Reviewed pairs pack; Sound pairs drills; Listen in the choice control; read aloud after a check | Static and unit checks: pack schema, drill preparation, grading, i18n. No AI or key needed. Owner accepts the UI by hand. No E2E gate |
| 2 | Per-contrast counts in Progress | Counts equal a hand count of fixture attempts; they survive backup and restore |
| 3 | Option C with the SDK (approved 2026-10-21): Azure provider, key and region entered by the learner | Real provider smoke run by the owner. Errors show the real reason. No invented fields. A threshold only after a measured trial on the owner's own recordings |

## 12. Open questions for the owner

| Question | Default |
| --- | --- |
| Run phase 0 before any code? | Yes |
| Add Azure as a provider (option C) with the SDK? | **Decided 2026-10-21: yes, SDK, the learner's own key and region** |
| Target accent for pairs and reference: fr-FR, fr-CA or both? | fr-FR, matching the current IPA chart. fr-CA as a reviewed note where it differs |
| Who reviews the pairs? | The owner, through the review sheet used for noun gender |
| Keep drill recordings (new `shadowing` owner kind)? | No in v1 |
| Fix the `index.ts:92` transcript fallback and the example numbers in the assessment prompts as a separate issue now? | Yes, open GitHub issues |
| Make browser speech recognition opt-in? | Yes, decided with that issue |
| Show Azure's per-phoneme scores without names? | **Decided 2026-10-22: no.** Word-level scores only; French returns no phoneme names and the order against our IPA is unverified |
