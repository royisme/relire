# Relire

**English** · [简体中文](README.zh-CN.md)

*Relire* is French for "to read again". It is a close-reading assistant for French learners: read a real article, tap any word or sentence to see what it means in context, then read it aloud and get feedback on your pronunciation. It is built for people preparing for **TCF Canada**, and it focuses on two skills: **reading** and **pronunciation**.

It runs entirely in your browser. There is no app server and no account. You bring your own Gemini API key, and you can install it as an app on your computer or phone.

> **What it is not.** It does not cover the listening or writing tests, it has no TCF mock exams, and its scores are AI estimates, not official ones. It is not affiliated with or endorsed by France Éducation international or IRCC. Use it alongside real past papers and a teacher.

## What you can do

- **Read articles at B1, B2 and C1.** Three sample texts are included, and you can paste or import your own. Choose text size and theme, and slow the audio down to 0.5×.
- **Tap any word.** You get the lemma, meaning in context, IPA, the verb tense, a conjugation table and example sentences. Save it to your vocabulary in one click.
- **Break down a hard sentence.** Translation, syntax segments, grammar points, common collocations and a shadowing guide (rhythm groups, liaisons, intonation).
- **Shadow and get feedback.** Record yourself reading a sentence and receive an overall score, plus feedback on individual sounds, liaisons and intonation.
- **Review vocabulary with spaced repetition.** An SM-2 schedule decides what is due today.
- **Drill from the article you are reading.** Sentence scramble, oral shadowing and grammar cloze, generated from the current text.
- **Use it in English or Chinese.** The interface and the explanations switch between the two.

## Quick start

You need [Bun](https://bun.sh) and a free [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/royisme/relire.git
cd relire
bun install
bun run dev        # http://localhost:5173
```

Open the app, go to **Settings**, and paste your key. Word and sentence analysis, audio and pronunciation feedback all need it.

### Run it as an installed app

```bash
bun run build      # static files in dist/
bun run preview    # serve them locally
```

`dist/` is a plain static site, so you can also host it anywhere (GitHub Pages, Netlify, an S3 bucket). Open it in Chrome, Edge or Safari and use the browser's install option; it then opens in its own window. Installing needs `localhost` or HTTPS.

Reading, your saved words and vocabulary review work offline. Anything that calls Gemini needs a connection.

### Privacy

Your articles, vocabulary and stats are stored in this browser's IndexedDB, and your API key and settings in its local storage. You can export and restore a backup from Settings (backups never include the key). Browsers can clear site data when space runs low or after long inactivity, particularly Safari for sites that are not installed, so install the app, use **Protect my data** in Settings, and export a backup now and then. When you use an AI feature, the word, sentence or recording is sent from your browser straight to Google's Gemini API using your key. Nothing goes through any other server. Anyone with access to your browser profile can read the stored key, so use a key you can revoke.

## How it is built

React 19, Vite, Tailwind CSS 4, i18next, and the `@google/genai` SDK called directly from the browser. `PRODUCT.md` describes who it is for and the principles behind it, `DESIGN.md` is the visual system, and `CLAUDE.md` is a map of the code for contributors.

```
src/services/gemini.ts   every Gemini call (analysis, assessment, drills, speech)
src/App.tsx              app state and localStorage persistence
src/components/          one file per screen or overlay
src/utils/srs.ts         SM-2 scheduling
```

`bun run lint` runs the TypeScript check. There are no automated tests yet.

## Contributing

Issues and pull requests are welcome. Please read `PRODUCT.md` and `DESIGN.md` before changing the UI, and keep every user-facing string in both `src/i18n/locales/en.json` and `zh.json`.

## License

[MIT](LICENSE)
