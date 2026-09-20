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
- **Custom OMR Creator** — generates an exact, printable bubble sheet with
  four corner fiducial markers, downloadable as PNG or sendable straight to
  the browser print dialog.
- **Magic Mode scanner** — live camera guidance (move closer/farther, too
  dark, glare, hold steady, sheet detected), auto-capture when the sheet is
  stably framed, or manual capture / choose-from-gallery.
- **Real computer vision, not a simulation**:
  - detects the four corner fiducial markers in the photo
  - solves a 4-point homography and rectifies the photo into the sheet's
    reference coordinate space
  - samples every bubble at its exact known template position and measures
    fill/darkness to decide answered / blank / multiple / unclear
  - computes genuine scan-quality metrics (sharpness, brightness, glare,
    corner confidence, perspective distortion) and will refuse to silently
    grade a bad scan
  - reads roll-number bubbles the same way; **never invents an answer or an
    identity** — anything below confidence goes to a review queue
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
- **Offline-first** — everything above works with no network connection.
  Service worker caches the full app shell.
- **Privacy controls** — delete a single result, delete a whole test, or
  wipe all local data, from Settings. Nothing is ever uploaded anywhere;
  all image processing happens in the browser on-device.

## AI Vision (v2) — real, optional, bring-your-own-key

Settings → **AI Vision** lets you paste your own Claude API key. It's stored
only in this browser's `localStorage` and calls `api.anthropic.com` directly
from the browser using Anthropic's documented
`anthropic-dangerous-direct-browser-access` header — this is Anthropic's
supported "bring your own key" pattern for exactly this situation (a static
site with no backend to proxy through). The key is never in source code,
never sent anywhere but Anthropic. Because it's client-side, anyone with
access to this browser/device could read the key from local storage —
use a key with a low spending limit.

With it configured:
- **Answer Key screen** — "Let AI read the question paper" sends a photo of
  the question paper to Claude's vision model and gets back a proposed
  answer key with a per-question confidence score and short reasoning
  (tap the "AI" badge on any row to see why). Every answer is still a
  manual-grid entry underneath — tapping any option overrides the AI
  proposal instantly and marks it "manual." The key still can't be approved
  until every question has an answer, AI-proposed or not.
- **Result screen** — an "Explain" button appears next to each wrong answer
  and generates a short, on-demand explanation. Never automatic, never
  blocks the fast-check workflow.
- **Scanning itself is unchanged** — AI is never used to read bubble marks
  off a scanned student sheet. That stays on the deterministic,
  homography-based CV engine in `omrScanner.js`, which is what makes "never
  invent a bubble location" an actual guarantee rather than a promise a
  language model can't fully keep at pixel precision.

With AI Vision off (the default) or offline, every AI-touched screen falls
back to fully manual entry — the app never blocks or degrades because AI
isn't available.

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
aiVision.js             Real Claude API calls: question-paper reading, explanations
omrGenerator.js         Builds + renders the exact OMR sheet template
imageProcessor.js       Grayscale, homography math, warping, patch sampling
omrScanner.js           Fiducial detection, rectification, bubble reading
camera.js               getUserMedia lifecycle + live-guidance loop
exportService.js        CSV (real) / Excel / PDF (interfaces)
batchScanner.js         Multi-sheet scan session tracking
app.js                  Router + every screen
```

## Notes on the scanner

OMR Magic can only reliably score sheets it generated itself (via **Custom
OMR Creator** in a test's **OMR sheet** screen), because the scanner reads
bubbles at exact coordinates from that sheet's own template — that's what
makes the recognition genuinely dependable instead of a generic, fragile
"guess the grid" algorithm. Print the generated sheet for your class; don't
substitute a hand-made one.
