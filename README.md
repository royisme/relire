# Éclair Français

**English** · [简体中文](README.zh-CN.md)

Read French the way you will meet it on the exam, look up what you do not understand without losing your place, and practise saying it out loud. Éclair Français is a self-hosted web app for learners preparing for **TCF Canada**, focused on two skills: **reading** and **pronunciation**.

> **What it is not.** It does not cover the listening or writing tests, it has no TCF mock exams, and its scores are AI estimates, not official ones. It is not affiliated with or endorsed by France Éducation international or IRCC. Use it alongside real past papers and a teacher.

## What you can do

- **Read articles at B1, B2 and C1.** Three sample texts are included, and you can paste or import your own. Choose text size and theme, and slow the audio down to 0.5×.
- **Tap any word.** You get the lemma, meaning in context, IPA, the verb tense, a conjugation table and example sentences. Save it to your vocabulary in one click.
- **Break down a hard sentence.** Translation, syntax segments, grammar points, common collocations and a shadowing guide (rhythm groups, liaisons, intonation).
- **Shadow and get feedback.** Record yourself reading a sentence and receive an overall score, plus feedback on individual sounds, liaisons and intonation.
- **Review vocabulary with spaced repetition.** An SM-2 schedule decides what is due today.
- **Drill from the article you are reading.** Sentence scramble, oral shadowing and grammar cloze, generated from the current text.
- **Use it in English or Chinese.** The interface and the explanations switch between the two.

Everything you save (articles, vocabulary, stats) stays in your browser's local storage. You can export and restore a backup from Settings.

## Quick start

You need Node 20.19 or newer (or 22.12+) and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/royisme/relire.git
cd relire
npm install --legacy-peer-deps   # or: bun install
cp .env.example .env             # then set GEMINI_API_KEY
npm run dev                      # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

You can also leave `GEMINI_API_KEY` unset and paste a key into **Settings** in the app; it is then sent with each request from your browser. The app installs as a PWA from the browser menu.

### Privacy

Words, sentences and your recordings are sent to the Gemini API through the app's own server to produce explanations, audio and scores. Nothing else leaves your browser. If you host it for other people, their usage is billed to the key on your server.

## How it is built

React 19, Vite, Tailwind CSS 4, an Express server that proxies Gemini, and i18next. `PRODUCT.md` describes who it is for and the principles behind it, `DESIGN.md` is the visual system, and `CLAUDE.md` is a map of the code for contributors.

```
server.ts          Express server, all Gemini calls
src/App.tsx        app state and localStorage persistence
src/components/    one file per screen or overlay
src/utils/srs.ts   SM-2 scheduling
```

`npm run lint` runs the TypeScript check. There are no automated tests yet.

## Contributing

Issues and pull requests are welcome. Please read `PRODUCT.md` and `DESIGN.md` before changing the UI, and keep every user-facing string in both `src/i18n/locales/en.json` and `zh.json`.

## License

[MIT](LICENSE)
