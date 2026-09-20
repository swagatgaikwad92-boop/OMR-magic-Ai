# OMR Magic

**Take a photo. Let OMR Magic do the boring work.**

A premium, mobile-first, installable PWA that scans and grades OMR (bubble)
answer sheets using real, on-device computer vision — no build step, no
backend, no npm. Pure HTML/CSS/vanilla JS, deployable straight to GitHub
Pages.

## Deploy on GitHub Pages

**Repo name:** anything works. Use `omr-magic` → your app lives at
`https://<your-username>.github.io/omr-magic/`. (Only a repo named exactly
`<your-username>.github.io` is served at the bare root URL.)

1. Create a **public** repo named `omr-magic`.
2. **Add file → Upload files**, and upload **every file from this folder**
   (index.html, styles.css, all the `.js` files, the three `.png` icons,
   manifest.webmanifest, service-worker.js). They must all sit in the repo
   root, next to `index.html`. This project is deliberately *flat* (no
   sub-folders) because GitHub's web uploader can't upload folders from a
   phone.
3. **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`
   → Save. Wait ~1 minute.
4. Open `https://<your-username>.github.io/omr-magic/` (with the trailing
   path!). Chrome menu → **Install app**.

If the app can't start (a file is missing), it now shows a diagnostic
screen listing exactly which files failed to load, instead of a blank page.

Camera scanning requires HTTPS (which GitHub Pages provides) and a device
with a camera.

## What actually works, right now, on-device

- **Create a test** — name, subject, class, question count, options per
  question, negative marking, roll-number digits, optional student-name line.
- **Answer key** — full manual entry grid, works completely offline. Tapping
  an "AI propose" button honestly reports itself unavailable unless you wire
  up a real provider (see below) — it never fabricates an answer key.
- **Reads ANY OMR sheet with AI (Gemini)** — no fixed template, no corner
  markers needed. For every photo the AI first works out the sheet's own
  layout (roll-number grid, sections, answer blocks, question numbers,
  option letters), then reads what the student marked, the handwritten
  name, and the roll number.
- **Double-checked reading** — a second pass crops every answer block and
  the roll-number grid from the full-resolution photo and reads them again,
  zoomed in. Where both readings agree the answer is accepted; where they
  disagree the question goes to review with the AI's best guess pre-selected
  (one tap to accept). Blank stays blank — nothing is guessed to fill a gap.
- **Magic Mode camera** — works with any sheet: live guidance (move
  closer/farther, too dark, glare, hold steady), auto-capture when the page
  is stably framed, full-resolution still capture, or choose a photo.
- **Optional Custom OMR Creator** — prints a ready-made bubble sheet, but you
  never need it: scan the sheets you already use.
- **Live, progressive checking** — reveals each already-computed, real
  result one question at a time for the "magic" feel (the pacing is
  animated; the data behind it is never randomized or fake).
- **Teacher review queue** for anything unclear/multiple/low-confidence,
  with accept / change / mark-unanswered / view-scanned-image actions.
- **Results** — circular score visualization, correct/wrong/unanswered/
  unclear breakdown, full per-question review, editable corrections.
- **Class insights** — average/highest/lowest/median, per-question accuracy,
  most-missed questions.
- **Batch scanning** — scan sheet after sheet for the same test with a
  running "N / total" counter and duplicate-sheet detection.
- **History** — every test with student count and class average, rename /
  duplicate / delete.
- **CSV export**, fully working, opens in Excel/Sheets.
- **Works offline for everything except scanning/AI** — tests, answer keys,
  results, insights and CSV export need no network; the app shell is cached.
  Reading a sheet needs an internet connection and your Gemini key.
- **Privacy controls** — delete a single result, delete a whole test, or
  wipe all local data, from Settings. Nothing is ever uploaded anywhere;
  all image processing happens in the browser on-device.

## AI Vision — real, optional, bring-your-own-key (Google Gemini)

Settings → **AI Vision** lets you paste your own Google Gemini API key (a
free key from <https://aistudio.google.com/apikey> works). It's stored only in
this browser's `localStorage` and calls
`generativelanguage.googleapis.com` directly from the browser — a static
site with no backend to proxy through. The key is never in source code and
never sent anywhere but Google. Because it's client-side, anyone with access
to this browser/device could read the key from local storage — use a key with
a low spending limit.

With it configured:
- **Answer Key screen** — "Let AI read the question paper" sends a photo of
  the question paper to Gemini's vision model and gets back a proposed
  answer key with a per-question confidence score and short reasoning
  (tap the "AI" badge on any row to see why). Every answer is still a
  manual-grid entry underneath — tapping any option overrides the AI
  proposal instantly and marks it "manual." The key still can't be approved
  until every question has an answer, AI-proposed or not.
- **Result screen** — an "Explain" button appears next to each wrong answer
  and generates a short, on-demand explanation. Never automatic, never
  blocks the fast-check workflow.
- **Scanning uses AI** — see `aiScanner.js`. Because a language model can
  misread a faint mark, the double-check pass and the review queue exist;
  use a flat, well-lit, in-focus photo for best results.

With AI Vision off, or offline, question-paper reading and explanations are
unavailable and answer keys are entered manually; scanning needs AI Vision.

## What's intentionally left as a clean interface, not faked

Building genuinely reliable versions of these requires either an external
AI service or a heavier dependency than a single-file, no-build PWA can
honestly claim to ship "complete." Rather than fake them, they're wired as
clean, swappable seams:

- **AI question-paper reading** (`answerKeyService.js` →
  `QuestionParser.callAIProvider`): the OCR → segmentation → reasoning →
  proposed-key pipeline described in the product spec is real, but the
  actual model call is a single function left for you to connect to
  whatever AI provider you choose. Until then (or when offline), the app
  says so plainly — "AI unavailable offline" / "not set up yet" — and falls
  back to the always-available manual answer-key grid.
- **Excel / PDF export** (`exportService.js`): CSV is fully implemented
  with zero dependencies. `exportExcel` and `exportPDF` are defined with the
  same interface shape so a real library (SheetJS, pdf-lib, etc.) can be
  dropped in later without touching any calling code.

## Project structure (flat — every file in the repo root)

```
index.html              App shell + boot guard + service-worker registration
manifest.webmanifest    PWA manifest
service-worker.js       Offline app-shell caching
styles.css              Liquid-glass design system
icon-192.png  icon-512.png  icon-maskable-512.png
storage.js              localStorage persistence layer
testManager.js          Test template CRUD
gradingEngine.js        Pure scoring logic
studentManager.js       Identity normalization helpers
resultManager.js        Result persistence + class insights
answerKeyService.js     Manual key helpers + QuestionParser (adapts aiVision output)
aiVision.js             Real Gemini API calls: question-paper reading, explanations
omrGenerator.js         Optional printable OMR sheet builder
imageProcessor.js       Grayscale, brightness/sharpness metrics (camera guidance)
aiScanner.js            Gemini-based layout understanding + mark reading + verification
camera.js               getUserMedia lifecycle + live-guidance loop
exportService.js        CSV (real) / Excel / PDF (interfaces)
batchScanner.js         Multi-sheet scan session tracking
app.js                  Router + every screen
```

## Notes on the scanner

Scanning is AI-driven, so it works on sheets from any source — including
ones printed elsewhere. For best accuracy: lay the sheet flat, fill the frame
with the whole page (all edges visible), use even light without glare, and
keep the camera steady. The **Double-check scans** switch in Settings
(default on) trades ~5 API requests per sheet for higher accuracy; the free
Gemini tier has per-minute limits, so for big batches switch it off or use a
paid key. Anything the two readings disagree on is put in front of you for a
one-tap confirmation.
