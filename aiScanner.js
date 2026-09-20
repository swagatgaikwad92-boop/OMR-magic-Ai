/* ============================================================
   aiScanner.js — reads ANY OMR sheet with Gemini vision.

   There is no fixed template. For every photo the AI is asked to
     1. understand the sheet's own layout (roll-number grid, sections,
        answer blocks, question numbers, option letters), and
     2. read what the student actually marked.

   Accuracy safeguards (so it is not just "one guess"):
     - Pass 1 reads the whole photo and also reports where each answer
       block / the roll-number grid sits.
     - Pass 2 (optional, on by default) crops each of those blocks from
       the full-resolution photo and reads them again, zoomed in, in
       parallel. Where both passes agree the answer is accepted; where
       they disagree the question goes to review with the AI's best
       guess pre-selected (one tap to accept) — never a blank "?".
     - Nothing is ever guessed to fill a gap: blank means blank.

   Output shape matches what GradingEngine / the review UI expect.
   ============================================================ */

const AIScanner = (() => {
  const FULL_MAX_SIDE = 2400;
  const CROP_MAX_SIDE = 1800;
  const LOW_CONF = 0.55;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ---------- image helpers ----------
  function scaledCanvas(src, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
    if (scale >= 1) return src;
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function toDataUrl(canvas, maxSide, quality) {
    return scaledCanvas(canvas, maxSide).toDataURL('image/jpeg', quality);
  }

  function validBox(b) {
    return Array.isArray(b) && b.length === 4 && b.every(n => typeof n === 'number' && isFinite(n))
      && b[2] - b[0] > 20 && b[3] - b[1] > 20;
  }

  // box = [ymin, xmin, ymax, xmax] on a 0..1000 scale (Gemini's convention)
  function cropBox(canvas, box, padFrac = 0.06) {
    const [y0, x0, y1, x1] = box.map(n => Math.max(0, Math.min(1000, n)));
    const padY = (y1 - y0) * padFrac, padX = (x1 - x0) * padFrac;
    const cy0 = Math.max(0, y0 - padY), cy1 = Math.min(1000, y1 + padY);
    const cx0 = Math.max(0, x0 - padX), cx1 = Math.min(1000, x1 + padX);
    const sx = Math.round(cx0 / 1000 * canvas.width), sy = Math.round(cy0 / 1000 * canvas.height);
    const sw = Math.max(8, Math.round((cx1 - cx0) / 1000 * canvas.width));
    const sh = Math.max(8, Math.round((cy1 - cy0) / 1000 * canvas.height));
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  }

  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // ---------- prompts ----------
  function sheetPrompt(test) {
    const n = test.numQuestions, k = test.numOptions;
    return `You are the reading engine of an OMR (bubble-sheet) grading app for teachers.
The photo shows ONE student's OMR answer sheet, photographed with a phone: it may be tilted, skewed, rotated, unevenly lit or on a cluttered background. Every school uses a different sheet, so do NOT assume any template — first understand THIS sheet's layout, then read what the student marked.

STEP 1 - UNDERSTAND THE LAYOUT
- Roll number / student ID: find the bubble grid where the student fills digits. Work out its arrangement: normally each COLUMN is one digit position and the ROWS are the digits 0-9 (or, less often, each ROW is a position and the columns are digits). Count the digit positions. There may also be handwritten digit boxes above/next to it.
- Answer blocks: find every contiguous group of question rows (sheets often have 2-4 columns, split into small blocks of 5 or 10 rows, each with its own A B C D header). Question numbers are printed beside the rows. Note sections/subject headings (for example "Subject 1", "Section 1").
- IGNORE: black corner or edge squares (timing marks), printed instructions, handwritten scores, totals, circles or notes written outside the grids.

STEP 2 - READ THE MARKS
- A bubble is MARKED when the student filled, shaded or darkened it (any ink: blue, black, pencil), even if the fill is imperfect. A bubble that is only an empty printed outline is NOT marked. A tick or cross counts only if it clearly covers the bubble.
- If a mark was scribbled out or erased and another bubble in the row was filled instead, the final answer is the other one. If you cannot tell, list every candidate and lower the confidence.
- If no bubble in a row is marked, "marked" must be an empty list. Blank is a valid answer. NEVER guess, and NEVER fill a blank with the likely correct answer.
- Report options as letters by POSITION: the first bubble in a row is "A", the second "B", and so on, even if the sheet labels them 1-4, a-d or (i)-(iv).
- Read question rows 1 to ${n} in numeric order (this test has ${n} questions with ${k} options each; that is only a hint - report what the sheet really contains). "q" is the question's running position across the whole sheet, starting at 1; normally it equals the printed number.
- Read the handwritten student name if a name line exists.

Return ONLY one JSON object (no markdown, no commentary) with exactly this shape:
{
  "readable": <true if you can read the sheet, false if it is not an OMR sheet or is too blurry/cut off to read>,
  "problems": [<zero or more of: "blurry","cropped","glare","too_dark","shadow","not_an_omr_sheet","skewed">],
  "layout": {
    "summary": "<one short sentence describing the layout, e.g. '50 questions in 3 columns, 4 options, 4-digit roll number'>",
    "numQuestions": <total number of question rows on the sheet>,
    "optionLabels": ["A","B","C","D"],
    "columns": <number of question columns>,
    "sections": [{"name": "<heading text>", "firstQuestion": <int>, "lastQuestion": <int>}],
    "rollNumber": {"present": <bool>, "positions": <number of digit positions>, "arrangement": "<columns_are_positions | rows_are_positions>", "box": [ymin, xmin, ymax, xmax]},
    "answerBlocks": [{"firstQuestion": <int>, "lastQuestion": <int>, "box": [ymin, xmin, ymax, xmax]}]
  },
  "student": {"name": "<handwritten name or null>", "nameConfidence": <0..1>},
  "rollNumber": {"digits": [<one entry per position, left to right or top to bottom: "0".."9", or null if blank/unclear>], "confidences": [<0..1 per position>], "handwrittenDigits": "<digits written in the boxes, or null>"},
  "answers": [{"q": <int>, "marked": [<letters>], "confidence": <0..1>}]
}
Box coordinates are [ymin, xmin, ymax, xmax] normalised to 0-1000 over the WHOLE photo. Each answerBlocks box must tightly enclose ONE column-block of consecutive question rows including their question numbers and the bubbles. Give one "answers" entry for every question row from 1 to ${n}; use lower confidence whenever the mark is faint, smudged, partly filled or ambiguous.`;
  }

  function blockPrompt(first, last, numOptions) {
    const lastLetter = LETTERS[Math.max(0, numOptions - 1)];
    return `This image is a zoomed crop of ONE block of an OMR answer sheet photographed with a phone. It should contain the question rows numbered ${first} to ${last}, with their option bubbles (A to ${lastLetter}, first bubble = A, second = B ...). The crop may also show slivers of neighbouring blocks: IGNORE any row whose question number is outside ${first}-${last}. Ignore black corner squares and any handwriting.

For every question row ${first} to ${last}, report which bubbles the student MARKED. A marked bubble is filled/shaded/darkened (any ink colour); an empty printed circle is NOT marked. If a mark was scribbled out and another bubble filled instead, the final answer is the other one. If no bubble is marked, "marked" is an empty list — blank is valid, never guess.

Return ONLY JSON, no markdown:
{"rows":[{"q": <question number as an integer>, "marked": [<letters>], "confidence": <0..1>}]}
Include every row ${first}-${last} that is visible. Lower the confidence whenever a mark is faint, partly filled or ambiguous.`;
  }

  function rollPrompt(positions, arrangement) {
    const how = arrangement === 'rows_are_positions'
      ? 'each ROW is one digit position and the columns are the digits'
      : 'each COLUMN is one digit position (read left to right) and the rows are the digits 0-9 as printed beside the grid';
    return `This image is a zoomed crop of the ROLL NUMBER area of an OMR sheet photographed with a phone. In the bubble grid ${how}. There ${positions ? 'should be ' + positions : 'are some'} digit position(s). For each position, find the ONE bubble the student filled (shaded/darkened; empty printed circles are not marked) and report its digit. If a position has no filled bubble, or more than one, report null for it. Also read any handwritten digits in the small boxes above/next to the grid, if present.

Return ONLY JSON, no markdown:
{"digits":[<"0".."9" or null, one per position>],"confidences":[<0..1 per position>],"handwrittenDigits":"<digits or null>"}`;
  }

  // ---------- parsing ----------
  function lettersToSet(marked) {
    const set = new Set();
    (Array.isArray(marked) ? marked : (typeof marked === 'string' && marked ? [marked] : [])).forEach(m => {
      const s = String(m).trim().toUpperCase();
      if (/^[A-Z]$/.test(s)) set.add(LETTERS.indexOf(s));
    });
    return set;
  }

  function rowsToMap(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach(r => {
      const q = parseInt(r && (r.q ?? r.question ?? r.number), 10);
      if (!q || q < 1) return;
      const conf = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.7;
      map.set(q, { set: lettersToSet(r.marked), conf });
    });
    return map;
  }

  function sameSet(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  function fromSet(set, conf) {
    if (set.size === 0) return { option: null, status: 'blank', confidence: conf };
    if (set.size === 1) return { option: [...set][0], status: 'answered', confidence: conf };
    return { option: null, status: 'multiple', confidence: Math.min(conf, 0.5), candidates: [...set] };
  }

  // Tall blocks (e.g. 26 rows in one column) are split into crops of at most
  // MAX_ROWS rows so every bubble is read at a larger size. Row positions are
  // estimated evenly inside the block box; crops overlap by ~2 rows so an
  // estimate that is slightly off cannot cut a row in half.
  const MAX_ROWS = 12, OVERLAP_ROWS = 2;
  function splitBlock(b) {
    const n = b.last - b.first + 1;
    if (n <= MAX_ROWS + 2) return [{ first: b.first, last: b.last, ext0: b.first, ext1: b.last, box: b.box }];
    const parts = Math.ceil(n / MAX_ROWS), per = Math.ceil(n / parts);
    const [y0, x0, y1, x1] = b.box, h = y1 - y0;
    const out = [];
    for (let i = 0; i < parts; i++) {
      const f = b.first + i * per, l = Math.min(b.last, f + per - 1);
      if (f > b.last) break;
      const e0 = Math.max(b.first, f - OVERLAP_ROWS), e1 = Math.min(b.last, l + OVERLAP_ROWS);
      const ty0 = (e0 - b.first) / n, ty1 = (e1 - b.first + 1) / n;
      out.push({ first: f, last: l, ext0: e0, ext1: e1, box: [y0 + h * ty0, x0, y0 + h * ty1, x1] });
    }
    return out;
  }

  // ---------- merge pass 1 (full photo) with pass 2 (zoomed crops) ----------
  function mergeAnswers(map1, map2, test) {
    const out = [];
    let compared = 0, agreed = 0;
    for (let q = 1; q <= test.numQuestions; q++) {
      const a = map1.get(q) || null, b = map2 ? (map2.get(q) || null) : null;
      let det;
      if (!a && !b) {
        det = { option: null, status: 'unclear', confidence: 0, reason: 'missing', suggested: null };
      } else if (a && b) {
        compared++;
        if (sameSet(a.set, b.set)) {
          agreed++;
          det = fromSet(b.set, Math.min(1, Math.max(a.conf, b.conf)));
        } else {
          const pick = b.set.size <= 1 ? b : a;
          det = { option: null, status: 'unclear', confidence: 0.4, reason: 'disagree',
                  suggested: pick.set.size === 1 ? [...pick.set][0] : null, suggestedBlank: pick.set.size === 0 };
        }
      } else {
        const one = a || b;
        det = fromSet(one.set, one.conf);
      }

      if (det.status !== 'unclear') {
        if (det.option !== null && det.option >= test.numOptions) {
          det = { option: null, status: 'unclear', confidence: 0.4, reason: 'range', suggested: null };
        } else if (det.confidence < LOW_CONF && det.status !== 'multiple') {
          det = { option: null, status: 'unclear', confidence: det.confidence, reason: 'low',
                  suggested: det.option, suggestedBlank: det.status === 'blank' };
        }
      }
      out.push(det);
    }
    return { answers: out, compared, agreed };
  }

  function mergeRoll(roll1, roll2, layout) {
    const hand = (roll2 && roll2.handwrittenDigits) || (roll1 && roll1.handwrittenDigits) || null;
    const handStr = hand ? String(hand).replace(/\D/g, '') : '';
    const d1 = roll1 && Array.isArray(roll1.digits) ? roll1.digits : null;
    const d2 = roll2 && Array.isArray(roll2.digits) ? roll2.digits : null;
    const base = d2 || d1;
    if (!base || !base.length) return null;

    const clean = (d) => (d === null || d === undefined || d === '') ? null : String(d).replace(/\D/g, '').slice(0, 1) || null;
    const conf1 = (roll1 && roll1.confidences) || [], conf2 = (roll2 && roll2.confidences) || [];
    let digits = '', minConf = 1, clear = true;

    for (let i = 0; i < base.length; i++) {
      const x = d1 ? clean(d1[i]) : null, y = d2 ? clean(d2[i]) : null;
      let digit, conf;
      if (x !== null && y !== null) {
        if (x === y) { digit = x; conf = Math.max(conf1[i] ?? 0.8, conf2[i] ?? 0.8); }
        else { digit = y; conf = 0.4; } // the zoomed read wins, but flag low confidence
      } else if (x !== null || y !== null) {
        digit = x !== null ? x : y;
        conf = (x !== null ? conf1[i] : conf2[i]) ?? 0.7;
        if (d1 && d2) conf = Math.min(conf, 0.6);
      } else { digit = null; conf = 0.3; }
      if (digit === null) { clear = false; digits += '?'; } else digits += digit;
      minConf = Math.min(minConf, conf);
    }
    if (clear && handStr && handStr.length === digits.length) {
      if (handStr === digits) minConf = Math.max(minConf, 0.95);
      else minConf = Math.min(minConf, 0.5);
    }
    return { rollNumber: clear ? digits : null, raw: digits, confidence: Math.max(0, Math.min(1, minConf)), clear, handwritten: handStr || null };
  }

  const PROBLEM_TEXT = {
    blurry: 'Photo is blurry', cropped: 'Part of the sheet is cut off', glare: 'Glare on the sheet',
    too_dark: 'Low light', shadow: 'Shadow across the sheet', skewed: 'Sheet is at a steep angle',
  };

  // ---------- main entry ----------
  // canvas: full-resolution photo. onStage({stage, detail}) is optional progress feedback.
  async function scanSheet(canvas, test, opts = {}) {
    const onStage = opts.onStage || (() => {});
    const cfg = AIVision.getConfig();
    const verify = opts.verify !== undefined ? opts.verify : cfg.verifyScans !== false;

    if (!AIVision.isOnline()) return { success: false, reason: 'offline', message: 'You\u2019re offline. Reading a sheet needs an internet connection (AI Vision).' };
    if (!AIVision.isConfigured()) return { success: false, reason: 'not_configured', message: 'Add your Gemini API key in Settings and switch AI Vision on to scan sheets.' };

    // ----- pass 1: whole photo -----
    onStage({ stage: 'layout' });
    const fullUrl = toDataUrl(canvas, FULL_MAX_SIDE, 0.9);
    let pass1;
    try {
      const text = await AIVision.generate(
        [dataUrlPart(fullUrl), { text: sheetPrompt(test) }],
        { maxTokens: 32000, json: true, timeoutMs: 150000 }
      );
      pass1 = AIVision.extractJson(text);
    } catch (e) {
      console.error('AIScanner pass 1 failed', e);
      return { success: false, reason: 'ai_error', message: 'AI couldn\u2019t read this photo (' + (e.message || 'unknown error') + ').' };
    }

    const problems = Array.isArray(pass1.problems) ? pass1.problems.filter(p => typeof p === 'string') : [];
    if (pass1.readable === false || problems.includes('not_an_omr_sheet')) {
      const why = problems.filter(p => PROBLEM_TEXT[p]).map(p => PROBLEM_TEXT[p].toLowerCase());
      return { success: false, reason: 'unreadable', message: 'This doesn\u2019t look like a readable OMR sheet' + (why.length ? ' (' + why.join(', ') + ')' : '') + '. Lay it flat, fill the frame with the whole sheet and try again.' };
    }
    const map1 = rowsToMap(pass1.answers);
    if (!map1.size) {
      return { success: false, reason: 'no_answers', message: 'AI couldn\u2019t find any answer rows in this photo. Make sure the whole sheet is visible and in focus.' };
    }
    const layout = pass1.layout || {};
    onStage({ stage: 'mapped', detail: layout.summary || '' });

    // ----- pass 2: zoomed crops of every block, in parallel -----
    let map2 = null, roll2 = null, verified = false, verifyNote = null;
    const blockCrops = [];
    if (verify) {
      onStage({ stage: 'verify' });
      const blocks = (Array.isArray(layout.answerBlocks) ? layout.answerBlocks : [])
        .map(b => ({ first: parseInt(b.firstQuestion, 10), last: parseInt(b.lastQuestion, 10), box: b.box }))
        .filter(b => b.first >= 1 && b.last >= b.first && validBox(b.box) && b.first <= test.numQuestions);
      const rollInfo = layout.rollNumber || {};
      const doRoll = rollInfo.present !== false && validBox(rollInfo.box);

      const crops = blocks.flatMap(splitBlock).filter(c => c.first <= test.numQuestions); // skip crops the test never grades
      const tasks = crops.map(async (b) => {
        const crop = cropBox(canvas, b.box, 0.10);
        const url = toDataUrl(crop, CROP_MAX_SIDE, 0.92);
        blockCrops.push({ first: b.first, last: b.last, dataUrl: toDataUrl(crop, 900, 0.75) });
        const text = await AIVision.generate(
          [dataUrlPart(url), { text: blockPrompt(b.ext0, b.ext1, test.numOptions) }],
          { maxTokens: 12000, json: true, timeoutMs: 120000 }
        );
        const rows = rowsToMap(AIVision.extractJson(text).rows);
        // drop rows that leaked in from neighbouring blocks; remember which are this crop's own ("core") rows
        for (const q of [...rows.keys()]) {
          if (q < b.ext0 || q > b.ext1) rows.delete(q);
          else rows.get(q).core = q >= b.first && q <= b.last;
        }
        return rows;
      });
      const rollTask = doRoll ? (async () => {
        const crop = cropBox(canvas, rollInfo.box, 0.08);
        const text = await AIVision.generate(
          [dataUrlPart(toDataUrl(crop, CROP_MAX_SIDE, 0.92)), { text: rollPrompt(rollInfo.positions, rollInfo.arrangement) }],
          { maxTokens: 4000, json: true, timeoutMs: 90000 }
        );
        return AIVision.extractJson(text);
      })() : Promise.resolve(null);

      const settled = await Promise.allSettled([...tasks, rollTask]);
      blockCrops.sort((p, q) => p.first - q.first);
      const blockResults = settled.slice(0, tasks.length);
      const rollResult = settled[settled.length - 1];

      const okBlocks = blockResults.filter(r => r.status === 'fulfilled');
      if (okBlocks.length) {
        map2 = new Map();
        // prefer the crop where a row sits in its own core (not in the overlap margin)
        okBlocks.forEach(r => r.value.forEach((v, q) => {
          const prev = map2.get(q);
          if (!prev || (v.core && !prev.core)) map2.set(q, v);
        }));
        verified = true;
      }
      if (rollResult.status === 'fulfilled' && rollResult.value) roll2 = rollResult.value;
      const failed = settled.filter(r => r.status === 'rejected');
      if (failed.length) {
        console.warn('AIScanner verify calls failed', failed.map(f => f.reason && f.reason.message));
        verifyNote = failed.length === settled.length
          ? 'Double-check step was skipped (' + ((failed[0].reason && failed[0].reason.message) || 'error') + ')'
          : 'Some zoomed checks were skipped';
      }
      if (!crops.length) verifyNote = 'Couldn\u2019t locate answer blocks for the zoomed double-check';
    }

    // ----- merge + package -----
    onStage({ stage: 'grade' });
    const { answers, compared, agreed } = mergeAnswers(map1, map2, test);
    const rollResult = mergeRoll(pass1.rollNumber, roll2, layout);

    const answered = answers.filter(a => a.status !== 'unclear');
    const avgConf = answers.length ? answers.reduce((s, a) => s + (a.confidence || 0), 0) / answers.length : 0;
    const agreement = compared ? agreed / compared : null;
    const score = Math.round((verified && agreement !== null ? (agreement * 0.7 + avgConf * 0.3) : avgConf) * 100);

    const warnings = problems.filter(p => PROBLEM_TEXT[p]).map(p => PROBLEM_TEXT[p]);
    const notes = [];
    const sheetQ = parseInt(layout.numQuestions, 10);
    if (sheetQ && sheetQ !== test.numQuestions) {
      notes.push(sheetQ > test.numQuestions
        ? `Sheet has ${sheetQ} questions; grading questions 1\u2013${test.numQuestions} for this test.`
        : `Sheet has only ${sheetQ} questions but this test has ${test.numQuestions}.`);
    }
    const sheetOpts = Array.isArray(layout.optionLabels) ? layout.optionLabels.length : 0;
    if (sheetOpts && sheetOpts !== test.numOptions) notes.push(`Sheet has ${sheetOpts} options per question; this test is set to ${test.numOptions}.`);
    if (verifyNote) notes.push(verifyNote);

    const student = pass1.student || {};
    const name = (student.name && String(student.name).trim() && (student.nameConfidence ?? 0.6) >= 0.4) ? String(student.name).trim() : null;

    const signature = answers.map(a => a.status === 'answered' ? LETTERS[a.option] : (a.status === 'blank' ? '-' : '?')).join('');
    const fingerprint = hashString((rollResult && rollResult.raw || '') + '|' + (name || '').toLowerCase() + '|' + signature);

    return {
      success: true,
      detectedAnswers: answers,
      rollNumberResult: rollResult,
      studentName: name,
      fingerprint,
      previewDataUrl: toDataUrl(canvas, 1000, 0.65),
      blockCrops,
      layout,
      quality: {
        score, warnings, notes, verified,
        agreement: agreement === null ? null : Math.round(agreement * 100),
        summary: layout.summary || '',
        model: cfg.model,
        answeredCount: answered.length,
      },
    };
  }

  function dataUrlPart(dataUrl) {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
    if (!m) throw new Error('Unsupported image format');
    return { inlineData: { mimeType: m[1], data: m[2] } };
  }

  return { scanSheet, _internals: { mergeAnswers, mergeRoll, rowsToMap, cropBox, validBox } };
})();
