# Relire Plus — French Reading, Pronunciation & Exercise Practice

**Open-source French close reading, shadowing, pronunciation and exercise practice for TCF Canada.**

[Try Relire Plus online](https://royisme.github.io/relire/) · **English** · [简体中文](README.zh-CN.md)

Read real French → tap a word or sentence → understand it in context → shadow the sentence → get AI pronunciation feedback → practise with exercises and review your mistakes.

Relire Plus runs entirely in your browser. There is no application server and no account. AI is optional: bring your own provider and its key (Ollama needs none) for explanations and feedback, keep your learning data on your device, and install it as a PWA on desktop or mobile.

**Why Relire Plus**

- Context-aware word explanations with IPA and verb tense, plus a Conjugation page with reviewed tables and rule-checked forms.
- Sentence translation, grammar breakdown, collocations and shadowing guidance.
- Pronunciation feedback: Azure Speech scores your recording, Gemini can assess it, and other text AI providers give transcript-based guidance only where a transcript is available.
- 11 exercise types, including number dictation, generated from your material or imported from worksheets; an AI judges open answers in words, not with a score.
- Material import from images, PDFs or text, with a mistake notebook and progress counted from real practice.
- Spaced-repetition vocabulary review with FSRS-6.
- Today, graded readers, vocabulary review, reviewed conjugation and the noun-gender reference work without an AI key.
- Local-first storage and cached audio/AI results.
- English and Simplified Chinese interfaces.

> Relire Plus covers reading, pronunciation and exercise practice. It is not a TCF mock-exam platform, its AI scores are estimates rather than official results, and it is not affiliated with France Éducation international or IRCC.

## A look inside

Read a French article with adjustable text size and playback speed.

![French article in the Relire Plus reader](docs/media/reader.jpg)

Tap a word to see its meaning in context, IPA and pronunciation guidance beside the article.

![Contextual analysis of affronter, with IPA and pronunciation guidance](docs/media/word-analysis.jpg)

Break down a sentence into grammatical parts while keeping the original text in view.

![Sentence syntax split into labelled grammatical segments](docs/media/sentence-syntax.jpg)

<details>
<summary>Article library and shadowing guide</summary>

Search and filter articles by CEFR level.

![Article library with search and CEFR level filters](docs/media/library.jpg)

Follow the sentence translation and shadowing guide, and adjust playback speed as you practise.

![Sentence translation and shadowing guide](docs/media/sentence-shadowing.jpg)

</details>

## What you can do

- **Start on Today.** The app opens on Today: a short list of steps taken from your own activity (words to review, a graded reader, sound pairs, mistakes to redo, and a grammar topic when topics are available) and links to Words, Reading, Speaking and Grammar. It needs no key.
- **Read graded readers.** An ordered starter list with authored word meanings, sentence translations you reveal, saved words, listening through your device voice and local checkpoints. They need no key or service. They are AI-reviewed, not human-reviewed.
- **Keep a library of articles.** Three B1 to C1 samples are included. Paste your own or import one from images or a PDF (read by your AI) or from text, then search, filter by level, sort, edit or delete them from a simple list. Choose text size and theme, and slow the audio down to 0.5×.
- **Tap any word.** You get the lemma, meaning in context, IPA, the verb tense and example sentences. For a verb in the reviewed list the word sheet shows its conjugation table, with no AI; any other verb links to the Conjugation page. Save the word to your vocabulary in one click.
- **Break down a hard sentence.** Translation, syntax segments, grammar points, common collocations and a shadowing guide (rhythm groups, liaisons, intonation).
- **Shadow and get feedback.** Record yourself reading a sentence and receive an overall score. With Azure Speech you also get accuracy, fluency and word-level results; with Gemini hearing the recording you get feedback on individual sounds, liaisons and intonation; other text AI providers give transcript-based guidance only where a transcript is available. The takes you keep are in Recordings, under Speaking, where you can compare them with the reference.
- **Look up any French sound.** Speaking has a chart of the sounds of French in IPA, each with an example word you can tap to hear, and Sound pairs drills.
- **Build vocabulary in Words.** Save words while you read or import a list (`.txt`, `.tsv`, `.csv` or Anki `.apkg`). An FSRS-6 schedule decides what is due; you rate each word Forgot, Fuzzy or Remembered. Play offers retrieval questions before answers are revealed, and Map groups downloaded wordbook pages, imported decks and saved words; the wordbook comes from the optional content service.
- **Practise grammar.** Conjugation shows the supported tenses of a verb: a verb in the reviewed list is answered from it with no AI, and any other verb is asked of the AI and compared with the app's own rules, so a result says whether it matches the rule, never that it is verified. Gender lists 17 noun-ending tendencies with examples and exceptions, and both can make exercises without another AI call. Grammar topics come from the optional content service.
- **Exercises in four areas.** Reading, Grammar, Listening and Writing each list their exercise sets. Make fill-in-the-blank, multiple-choice, word-form, open and other questions from any article or import a worksheet, answer them on one sheet with hints, explanations and a French character bar, and read a sentence aloud for a pronunciation score. Listening has number dictation; Writing appears once you have saved a writing exercise.
- **Redo your mistakes.** Mistakes keeps the latest wrong answer for each exercise item, grouped by grammar area, and marks it resolved after a later correct attempt.
- **See your progress.** Progress shows words saved, your average pronunciation score, shadowing sessions and grammar accuracy as real correct and total counts.
- **Choose your AI.** Text, image reading, speech and pronunciation scoring each have their own provider, with a model where one applies (Azure and the device voice have none), and one key per provider serves every purpose that names it. Text and image reading: Google Gemini, an OpenAI-compatible service (a Base URL also covers DeepSeek, Qwen or a gateway of your own), Anthropic Claude, or Ollama on your own machine with no key. Speech: Gemini, Fish Audio or your device's voice, which needs no key. Pronunciation scoring: Microsoft Azure Speech with your key and region, or the text AI when Azure is not set up; only Gemini hears the recording, and other text providers give transcript-based guidance only where a transcript is available.
- **Edit the prompts.** The instructions sent to the AI are plain-text templates you can view, change and reset in Settings.
- **Use it in English or Chinese.** The interface and the explanations switch between the two.

## Try it online

Open **https://royisme.github.io/relire/**. You can browse the included sample articles immediately. Today and the graded readers work without a key. AI analysis, AI speech and pronunciation scoring need a key for the provider you choose, except Ollama and the device voice.

## Quick start

You need [Bun](https://bun.sh). For the AI features you also need a key from one of the providers above (Ollama needs none), for example a free [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/royisme/relire.git
cd relire
bun install
bun run dev        # http://localhost:5173
```

On first launch, when the selected text provider needs a key and none is saved, a three-step guide opens. You can create and check a key there or choose **Continue without AI**, and add a key later in **Settings**. Word and sentence analysis, AI audio and pronunciation feedback need a key unless you use Ollama or the device voice. While the selected text provider needs a key and none is saved, a banner offers to add one on every page except Today, the graded readers and Settings.

### Run it as an installed app

```bash
bun run build      # static files in dist/
bun run preview    # serve them locally
```

`dist/` is a plain static site, so you can also host it anywhere (GitHub Pages, Netlify, an S3 bucket). Open it in Chrome, Edge or Safari and use the browser's install option; it then opens in its own window. Installing needs `localhost` or HTTPS.

Once the app is installed, what is stored on your device works offline: your articles, saved words and review, the bundled graded readers, reviewed conjugation, the noun-gender reference, mistakes and cached audio. Anything that calls an AI provider or the optional content service needs a connection; Ollama needs only your own machine.

### Privacy

Your articles, vocabulary and stats are stored in this browser's IndexedDB, and your API key and settings in its local storage. You can export and restore a backup from Settings (backups never include the key). Browsers can clear site data when space runs low or after long inactivity, particularly Safari for sites that are not installed, so install the app, use **Protect my data** in Settings, and export a backup now and then. When you use an AI feature, the word, sentence or recording is sent from your browser straight to the AI provider you choose, using your key where the provider needs one. The fonts are bundled with the app, so nothing is requested from Google Fonts. Browser speech recognition is off by default. If you enable it, your browser may send microphone audio to the browser maker's speech service for transcription while you record, before you press Check pronunciation. Device speech uses browser or operating-system voices; network use depends on the voice. The app also contacts its host and, if you test or enable it, the optional content service. Like any web server they see your IP address. The content service also receives the service access key you set for it and the ids of the topics, books or readers you open. Neither of them ever sees your AI key, answers, articles or recordings. Generated explanations, drills and pronunciation audio are cached on your device. Reusing a cached result or audio clip needs no further API call, and cached audio works offline. Word analyses have no expiry; sentence analyses and drills expire after 30 days. Audio for saved vocabulary is protected from automatic cleanup; other clips may be removed when the audio store exceeds 200 MB. Settings shows what is saved and can clear it, and a backup can optionally include your vocabulary's audio. Anyone with access to your browser profile can read the stored key, so use a key you can revoke.

## How it is built

React 19, Vite, Tailwind CSS 4, i18next, and AI providers called directly from the browser (Gemini through `@google/genai`, Azure through its Speech SDK, OpenAI-compatible, Anthropic, Ollama and Fish Audio over `fetch`). `PRODUCT.md` describes who it is for and the principles behind it, `DESIGN.md` is the visual system, `docs/architecture.md` is a map of the code, and `CLAUDE.md` plus `.claude/` hold the guidance for AI coding agents.

```
src/services/ai/         providers, prompt templates and tasks; the UI calls src/services/api.ts
src/App.tsx              app wiring: route, key request and the first-run guide
src/storage/             IndexedDB persistence, answer cache and audio storage
src/components/          screens and overlays, grouped by area
src/utils/srs.ts         FSRS-6 scheduling
```

`bun run typecheck` runs the TypeScript check, `bun run lint` runs oxlint, `bun run format` formats with oxfmt, and `bun run e2e` runs the Playwright specs with every AI call mocked.

## Contributing

Issues and pull requests are welcome. Please read `PRODUCT.md` and `DESIGN.md` before changing the UI, and keep every user-facing string in both `src/i18n/locales/en.json` and `zh.json`.

## License

[MIT](LICENSE) for the code and documentation. The dictionary data files under `data/lexicon/` are a work based on Morphalou 3.1 and are licensed under the LGPL-LR; see [data/lexicon/NOTICE.md](data/lexicon/NOTICE.md) and [data/lexicon/LGPL-LR.txt](data/lexicon/LGPL-LR.txt).
