---
paths:
  - "src/components/**"
  - "src/hooks/**"
  - "src/index.css"
  - "index.html"
  - "src/theme/**"
---

# UI rules

Read `DESIGN.md` (tokens in `src/index.css`) and `PRODUCT.md` before changing a screen.

## Layout and interaction
- Controls must not move the page. Loading, playing, recording and errors show on the control that was pressed (icon swap, fixed size) or in an overlay, never as a row that appears and disappears.
- Check new layouts at 360 px with long text. Wrap (`break-words`, `min-w-0`, `flex-wrap`, equal grid columns) instead of fixing widths.
- Places are hash routes (`utils/routes.ts`, `hooks/useRoute.ts`): move between them with `shell/Link` or `navigate`, never with a local "current tab" state, and add a new place to the route table and to `shell/NavTree`. Settings is a page; only focused tasks are dialogs.
- Overlays come from `ui/overlay.tsx`: `Sheet` for lookups (bottom sheet on phones), `Dialog` for focused tasks, `Drawer` for navigation.
- Speech: use `SpeakButton` / `SpeakIcon` / `useSpeechPhase` from `ui/speak-button`; never keep your own `isSpeaking` state.
- Recording and scoring: use `components/shadowing/` and `hooks/useShadowingRecorder`, or in the reader `reader/PracticeCard` with `hooks/usePracticeCard`; screens never hold recorder state. Fixed bottom UI in the reader goes inside `reader/BottomDock` and uses the ink panel classes from `reader/panel.ts`.
- Exercise controls: one component per exercise type, behind the interface in `practice/controls/types.ts` and registered in `controls/index.ts`. A control draws the answer and registers its text fields (`registerInput`); it never grades, saves, checks or handles Enter. State and persistence live in `hooks/useExerciseUnit`; `ItemRow` (worksheets) or `TopicWorkbench` (topic snapshots) owns keys. Topic controls receive no lookup callback and use `correctionPlacement: 'feedback'` so the correction stays in the reserved result slot, not the prompt. Topic navigation uses local selectors, not new routes; one workbench owns one CharacterBar.
- Import drafts (the article import under Read and the exercise import under its required learning-area route context, one component each) stay in memory and use the shared route guard/Dialog (`useImportSession`, `LeaveDialog`); only successful atomic save releases protection before navigation. Native reload/close warnings apply only while dirty.
- Learning lists filter units before set aggregation. Complete sets retain all original areas, real whole totals and actual-area unit links; whole-set deletion belongs only there with named cross-area scope. Speaking/Read aloud is a separate durable source/sentence destination using the existing recorder, never a section below exercise lists. Grammar knowledge and saved exercises share real-link navigation outside My study. Writing navigation requires saved writing units; Listening supports number dictation only.
- Errors appear inline next to what failed, with the real reason. No `alert()` for new code.

- Words destinations are Today, All words and Review, with Words active throughout; use real links, not Segmented navigation. Review has one controlled two-sided Flashcard, with one visual-face owner in VocabularyReview, separate from durable answer unlock. Never mount back answer DOM before durable reveal; later flips are display-only. External Forgot/Fuzzy/Remembered actions appear only on the unlocked back as equal 48px circular X/EqualApproximately/Check targets with small visible labels, existing bad/warm-neutral/ok tint/ink and accessible names; no new palette, primary-blue recall emphasis, four-rating dashboard or interval captions. Skip remains independent with a bounded fixed status slot. Either face's word/prose/background flips through a textless native button sibling, never enclosing speech or selectable prose. Selection/drag/scroll, speech/error bubbles and other interactive children never flip; no visible Flip buttons or stacked Answer/Built-in headings. Preserve source attribution as quiet metadata. Active prose grows naturally, inactive face is inert/aria-hidden. Use the scoped 180ms functional flip, immediate under reduced motion. Focus the existing word heading on back, textless card control on front, next card control/wait heading after advance; ignore repeated/IME/overlay keys, consume native flip keydown/keyup once and restrict numeric shortcuts to 1=Forgot/2=Fuzzy/3=Remembered on the back. No automatic AI or speech. Lookup footer separates context save from bookmark removal and freezes original spelling/source/request language.

## Visual
- Every screen must work in light, sepia and dark. Use roles: `bg-surface` (never `bg-white`), `text-on-fill` on filled buttons (never `text-white`), `bg-scrim/NN` behind overlays, hue text from steps 800-950 (`text-accent-900`). No hex or arbitrary colour values outside `src/index.css`. Check a new screen in all three themes (`relire_theme` in localStorage).
- Structure with headings and rules, not nested cards or tinted boxes; no decorative icons beside headings or labels; one filled button per view.
- Prefer `ui/` primitives (`Button` variants and sizes) and design tokens (`ink-*`, `accent-*`, `ok-*`, `bad-*`) over ad-hoc colour classes.
- No gradients, glass/blur, emoji icons or uppercase eyebrow labels.
- Use motion to clarify state, spatial relationships or input feedback, not as decoration; do not impose a blanket animation ban. Keep it brief and respect reduced-motion preferences. Bounce or pulse needs a clear interaction purpose.
- Icons: lucide-react only, one stroke weight, `aria-hidden` when decorative.
- Never show invented data (sample stats, fake scores, placeholder streaks). Empty means empty.
- Run `~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html` (`impeccable` is not on PATH; `command -v` finding nothing does not mean it is missing); keep it at zero findings.

## Text
- Follow the voice in `DESIGN.md`: plain words, no hype, jargon, emoji, exclamation marks or numbered section titles.
- Every user-visible string goes through `t()`, including `aria-label`, `title`, `placeholder` and error text. Never `isEn ? … : …`. See the i18n rule for keys.

## Structure
- One screen or overlay per file. A component with sections gets a folder (`settings/`, `shadowing/`). Split a component past about 300 lines or when it starts owning persistence or service logic; move that logic into a hook or service.
