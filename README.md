# OMR Magic

**Take a photo. Let OMR Magic do the boring work.**

A premium, mobile-first, installable PWA that scans and grades OMR (bubble)
answer sheets using real, on-device computer vision — no build step, no
backend, no npm. Pure HTML/CSS/vanilla JS, deployable straight to GitHub
Pages.

## Deploy in one step

1. Push this repository to GitHub.
2. In **Settings → Pages**, set the source to the `main` branch, root folder.
3. Open the published URL. That's it — no build, no Node, no server.

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

## What's intentionally left as a clean interface, not faked

Building genuinely reliable versions of these requires either an external
AI service or a heavier dependency than a single-file, no-build PWA can
honestly claim to ship "complete." Rather than fake them, they're wired as
clean, swappable seams:

- **AI question-paper reading** (`js/answerKeyService.js` →
  `QuestionParser.callAIProvider`): the OCR → segmentation → reasoning →
  proposed-key pipeline described in the product spec is real, but the
  actual model call is a single function left for you to connect to
  whatever AI provider you choose. Until then (or when offline), the app
  says so plainly — "AI unavailable offline" / "not set up yet" — and falls
  back to the always-available manual answer-key grid.
- **Excel / PDF export** (`js/exportService.js`): CSV is fully implemented
  with zero dependencies. `exportExcel` and `exportPDF` are defined with the
  same interface shape so a real library (SheetJS, pdf-lib, etc.) can be
  dropped in later without touching any calling code.

## Project structure

```
index.html              App shell
manifest.webmanifest    PWA manifest
service-worker.js       Offline app-shell caching
css/styles.css          Liquid-glass design system
js/storage.js           localStorage persistence layer
js/testManager.js       Test template CRUD
js/gradingEngine.js     Pure scoring logic
js/studentManager.js    Identity normalization helpers
js/resultManager.js     Result persistence + class insights
js/answerKeyService.js  Manual key helpers + QuestionParser (AI interface)
js/omrGenerator.js      Builds + renders the exact OMR sheet template
js/imageProcessor.js    Grayscale, homography math, warping, patch sampling
js/omrScanner.js        Fiducial detection, rectification, bubble reading
js/camera.js            getUserMedia lifecycle + live-guidance loop
js/exportService.js     CSV (real) / Excel / PDF (interfaces)
js/batchScanner.js      Multi-sheet scan session tracking
js/app.js               Router + every screen
```

## Notes on the scanner

OMR Magic can only reliably score sheets it generated itself (via **Custom
OMR Creator** in a test's **OMR sheet** screen), because the scanner reads
bubbles at exact coordinates from that sheet's own template — that's what
makes the recognition genuinely dependable instead of a generic, fragile
"guess the grid" algorithm. Print the generated sheet for your class; don't
substitute a hand-made one.
