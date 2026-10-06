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
- Overlays come from `ui/overlay.tsx`: `Sheet` for lookups (bottom sheet on phones), `Dialog` for focused tasks, `Drawer` for navigation.
- Speech: use `SpeakButton` / `SpeakIcon` / `useSpeechPhase` from `ui/speak-button`; never keep your own `isSpeaking` state.
- Recording and scoring: use `components/shadowing/` and `hooks/useShadowingRecorder`; screens never hold recorder state.
- Errors appear inline next to what failed, with the real reason. No `alert()` for new code.

## Visual
- Every screen must work in light, sepia and dark. Use roles: `bg-surface` (never `bg-white`), `text-on-fill` on filled buttons (never `text-white`), `bg-scrim/NN` behind overlays, hue text from steps 800-950 (`text-accent-900`). No hex or arbitrary colour values outside `src/index.css`. Check a new screen in all three themes (`relire_theme` in localStorage).
- Structure with headings and rules, not nested cards or tinted boxes; no decorative icons beside headings or labels; one filled button per view.
- Prefer `ui/` primitives (`Button` variants and sizes) and design tokens (`ink-*`, `accent-*`, `ok-*`, `bad-*`) over ad-hoc colour classes.
- No gradients, glass/blur, emoji icons, bounce/pulse animations, uppercase eyebrow labels.
- Icons: lucide-react only, one stroke weight, `aria-hidden` when decorative.
- Never show invented data (sample stats, fake scores, placeholder streaks). Empty means empty.
- Run `impeccable detect --json src index.html`; keep it at zero findings.

## Text
- Follow the voice in `DESIGN.md`: plain words, no hype, jargon, emoji, exclamation marks or numbered section titles.
- Every user-visible string goes through `t()`, including `aria-label`, `title`, `placeholder` and error text. Never `isEn ? … : …`. See the i18n rule for keys.

## Structure
- One screen or overlay per file. A component with sections gets a folder (`settings/`, `shadowing/`). Split a component past about 300 lines or when it starts owning persistence or service logic; move that logic into a hook or service.
