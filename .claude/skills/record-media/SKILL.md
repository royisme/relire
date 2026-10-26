---
name: record-media
description: Record screenshots and short videos of the real Relire app for the README, the marketing pages or an issue. Refuses any recording that is not the real app showing committed public content. Use when asked for a screenshot, a screen recording or a demo video.
---

# Record media of the real app

Plan of record: `docs/word-atlas-plan.md` (P6, Q10). A picture or video of Relire shows only what the app really does, on content that is already public in this repo. If a request cannot meet the rules below, refuse it and say which rule it breaks; do not draw, mock up or edit UI to make it work.

## Rules (never bend)

1. **Real app, real state.** Record the running app (`bun run dev`, current code). Never rebuild a screen in HTML, Remotion or an image editor, never retouch pixels, never fake an AI answer, a score, a streak or a count. Remotion may only place a real clip in a frame and add captions.
2. **Public content only.** Allowed: Today, the bundled graded readers (open, tap a word, reveal a translation), the three sample articles with word and sentence analyses already cached on the device, Conjugation for a reviewed verb, the Gender reference, the sound chart, Progress with real counts.
3. **Never record:** Settings (key field), Words and Map (the wordbook and imported decks), library articles other than the three samples, Recordings (the owner's voice), any browser chrome, tab, bookmark or profile name, any dialog that shows a key, an email or a path. The wordbook is not committed; its entries and numbers never appear in media or captions.
4. **Read-only interaction.** Do not press Save word, Mark read, Check, Redo or any rating, and do not submit exercises: they write the owner's real learning data. Tapping words, opening panels, switching tabs and scrolling are fine. If you change a setting such as the language (`localStorage` key `relire_lang`), restore the previous value afterwards.
5. **Captions are claims.** Every caption states what the clip shows and is checked against the repo (for example "reviewed verbs come from the app's own list, no AI"). No superlatives, no numbers that `scripts/readme-numbers.ts` does not print. A caption must not contradict what is on screen (a "no key needed" caption over a page whose banner asks for a key is a defect to report, not to hide).
6. **English and Chinese parity.** Every video exists in both UI languages, recorded in that language, with captions in that language. Chinese screenshots are named `*.zh-CN.jpg`.
7. **Alt text states the claim**, no device frames, no gradients; a desktop and a phone shot may form a pair.

## Procedure

1. **Same origin as the data.** IndexedDB is per origin: run the dev server on the port the owner's Chrome already uses (`bun run dev -- --port 5199 --strictPort`), so the cached analyses and settings are there. Never import a backup into the owner's profile.
2. **Viewport.** `resize_page` to 1280×800 (recordings come out at 2560×1600). Check the page with `take_screenshot` first and look at it for anything that rule 3 forbids.
3. **Record each scene** with `screencast_start` (a path inside the workspace, `.local/promo/raw-<scene>.mp4`) and `screencast_stop`. Drive the page with one `evaluate_script` that waits between steps (`await new Promise((r) => setTimeout(r, 2500))`), because tool calls are too slow to pace a clip. Word tokens in readers are `span.reader-word`. The recording starts about 3 to 4 seconds late; trim the idle start in `shots.ts`.
4. **Look at every clip** as a contact sheet before using it: `ffmpeg -i raw.mp4 -vf "fps=0.8,scale=480:-1,tile=4x3" -frames:v 1 sheet.png`.
5. **Compose with Remotion outside the app** (no dependency in the app's `package.json`): in `.local/promo/video` run `bun add remotion @remotion/cli @remotion/media @remotion/fonts react react-dom`, copy `film/*` here into `src/` (and `remotion.config.ts` to the root), copy `public/fonts` into the project's `public/`, transcode clips with `ffmpeg -i raw.mp4 -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 public/clips/<name>.mp4`, edit `src/shots.ts` (one entry per shot: clip, from, to, caption, per language), and render `bunx remotion render src/index.ts Film-en out/overview.en.mp4` (and `Film-zh`). Remotion's bundler rejects top-level `await`; fonts load inside the component. Remotion is free for individuals and small companies; check its current licence before using it for a company.
6. **Poster and commit.** `ffmpeg -ss 9.5 -i out/overview.en.mp4 -frames:v 1 -q:v 3 overview.en.jpg`. Commit `docs/media/overview.<lang>.mp4` and the poster. Keep each mp4 under about 2 MB.
7. **README link.** GitHub does not play a repo-relative video or `<video>` tag in a README (only a `user-attachments` upload does, which is an outward-facing step for the owner). Link the poster image to the mp4 (`[![alt](docs/media/overview.en.jpg)](docs/media/overview.en.mp4)`); the blob page plays it.
8. **Report** what the recording shows, what it does not, the ids of any rule-4 value you changed and restored, and anything on screen that looked wrong (for example a banner that contradicts the caption).
