# Trying the graded readers by hand

What the owner checks, because a machine cannot: appearance, feel, real devices, real voices. Everything below runs without an AI key. Mark each line **ok**, **wrong** (with a screenshot or a sentence) or **n/a**; send the wrong ones back and they become `TASKS.md` steps.

## Start

1. `bun run dev` (Vite on `http://localhost:5173`; your running dev server is fine, do not restart it). No Worker, no `.env.local` and no API key are needed.
2. Use a fresh browser profile or clear site data once, so the first-run guide shows. Keep a second normal profile for the "after" checks.
3. The three bundled readers are AI-written and AI-reviewed, not human-reviewed. Judge the app, not the French; note any French or Chinese you doubt and it goes to the language reviewer.

## 1. First run without a key

- The guide opens. Step 1 says you can start without a key. Step 2 offers **Continue without AI** and does not demand a key. Step 3 offers **Open the first reader**. Skip still closes the guide.
- Opening the reader lands on `#/read/graded/a1-01`. The "add your API key" banner does **not** show on any graded page, and shows again elsewhere (Library).

## 2. The list (`#/read/graded`)

- Three readers in order with a level and a status line: Not opened, then Opened, then Read as you progress. Nothing jumps when the status changes.
- Navigation: the Reading menu and the sidebar both have **Graded readers**; the active state is right on the list and on a reader.
- At 360 px width (browser devtools responsive mode, any phone preset): one column, titles wrap, no horizontal scroll, targets easy to hit.

## 3. Reading one reader

- The header shows a short honest label ("AI-written and AI-reviewed, not human-reviewed"), not a long record.
- Tap a word: a sheet opens at once with the clicked spelling, its meaning in the interface language, the part of speech, the gender for nouns, and the sentence with its translation. Tap the same spelling in another sentence: the right occurrence, not the first one. Nothing asks for a key and Settings never opens by itself.
- Tap a sentence: an action called **Translation** (not Analyze) opens the sentence sheet; the translation is hidden until you press Show translation, and the sheet does not change height when it appears.
- Save word, Save this context, Remove bookmark: each does what its label says and the footer never jumps. Find the word in **My study → Words**; it shows the authored meaning and the sentence.
- Listen (the whole text) and the sentence play button: the voice is your device's own French voice, labelled **Device voice**. With no French voice installed you see a real error on the button and can keep reading. (Check on your phone too; voices differ a lot between devices.)
- Font size and speed controls still work. Article-only actions (edit, delete, Make exercises) are not shown.

## 4. Checkpoints and finishing

- After the text: a recognition question, then a typed one, each beside the quoted sentence. Check stays disabled until you answer. A wrong typed answer without the accent is **wrong** (strict accents). The verdict area keeps its height, shows the reference answer, and nothing advances by itself. Redo clears only that question.
- **Mark read** and **Mark unread** are explicit. Opening, playing and revealing a translation never mark it read. Reload the page: answers, check results and the read state are still there.

## 5. Recording

- On a sentence, open the practice card and record a take (microphone permission prompt is real). It saves, plays back, and the reference plays with the device voice. A take shorter than half a second is refused with a clear note. Take 4 replaces take 1 (three per sentence).
- **My study → Shadowing** lists the recording under the reader's title and the link opens that reader at that sentence.

## 6. Backup and restore

- Settings → Stored data: export a backup (with recordings), delete the three readers' progress by clearing site data, restore the file: progress, read state, saved words and the recording come back. Restoring a file edited to break the JSON is refused whole and changes nothing.

## 7. Speaking and Progress moved

- **Speaking** now has Read aloud, then **Sound pairs** (a button that opens the drill form, and your counts per contrast), then **French sounds** (tap a tile to hear it). **Progress** no longer has either; it keeps words saved, average pronunciation score, spoken sessions, exercise progress and recent scores.

## 8. Only if you have a text AI key

- On a word sheet and a sentence sheet an **Ask AI** button appears (and not before you add a key). Nothing runs until you press it; the answer appears in its own block labelled as not reviewed, below the authored text; a failure shows inside that block. With no key the button is simply absent.

## Not covered here

The content service (more readers from D1) needs the Worker and a published catalogue; see `worker/README.md` and `docs/graded-readers.md`. Real-Azure scoring and the practice-card marks are covered by the pronunciation notes, not by this list.
