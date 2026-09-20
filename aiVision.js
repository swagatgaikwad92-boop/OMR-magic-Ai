/* ============================================================
   aiVision.js — real AI vision integration (Stages A/B and the
   optional "Explain" feature from the product spec).

   Honesty note: OMR Magic does not ship an API key. The teacher
   supplies their own Google Gemini API key (a free key from
   Google AI Studio works) in Settings, stored only in this
   browser's localStorage — never in source code, never sent
   anywhere but generativelanguage.googleapis.com. Calls go
   directly from the browser (the Gemini API allows CORS), since
   there is no backend to proxy through in a static GitHub Pages
   deployment. If no key is configured, or
   the device is offline, every function below reports itself
   unavailable rather than fabricating a result — the app keeps
   working in Manual Mode either way.

   AI is used here for UNDERSTANDING (reading a question paper,
   proposing an answer key with visible confidence + reasoning,
   explaining a wrong answer) — never for reading the actual
   bubble marks on a scanned student sheet. That grading stays on
   omrScanner.js's deterministic, inspectable computer-vision
   engine, which is what makes "never invent a bubble location"
   an actual guarantee rather than a promise.
   ============================================================ */

const AIVision = (() => {
  const CONFIG_KEY = 'omrmagic:v1:ai-config';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const DEFAULT_MODEL = 'gemini-3.8-flash';

  function getConfig() {
    const blank = { apiKey: '', model: DEFAULT_MODEL, enabled: false };
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return blank;
      const cfg = JSON.parse(raw);
      // A config saved by an older version (different AI provider) is useless now: drop it.
      if (!cfg.model || !/^gemini/i.test(cfg.model)) return blank;
      return cfg;
    } catch (e) {
      return blank;
    }
  }

  function setConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function isConfigured() {
    const cfg = getConfig();
    return !!(cfg.enabled && cfg.apiKey && cfg.apiKey.trim().length > 10);
  }

  function isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  // Calls Gemini's generateContent. `parts` is an array of Gemini parts
  // ({text} or {inlineData}). Returns the model's text.
  async function callGemini(parts, { maxTokens = 2000, json = false } = {}) {
    const cfg = getConfig();
    const model = encodeURIComponent(cfg.model || DEFAULT_MODEL);
    const generationConfig = { maxOutputTokens: maxTokens };
    if (json) generationConfig.responseMimeType = 'application/json';
    const res = await fetch(`${API_BASE}${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': cfg.apiKey.trim(),
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = text.slice(0, 200);
      try { msg = JSON.parse(text).error.message || msg; } catch (e) { /* keep raw */ }
      throw new Error(`API error ${res.status}: ${msg}`);
    }
    const data = await res.json();
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error('Request blocked by Gemini (' + data.promptFeedback.blockReason + ')');
    }
    const cand = (data.candidates || [])[0];
    const out = cand && cand.content && cand.content.parts
      ? cand.content.parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('')
      : '';
    if (!out && cand && cand.finishReason && cand.finishReason !== 'STOP') {
      throw new Error('Gemini returned no text (' + cand.finishReason + ')');
    }
    return out;
  }

  function extractJson(text) {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in AI response');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function dataUrlToImagePart(dataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
    if (!match) throw new Error('Unsupported image format');
    return { inlineData: { mimeType: match[1], data: match[2] } };
  }

  // ---------------- Stage A/B: question paper -> proposed answer key ----------------
  async function analyzeQuestionPaper(imageDataUrl, expectedNumQuestions) {
    if (!isOnline()) return { ok: false, reason: 'offline', message: 'AI unavailable offline' };
    if (!isConfigured()) return { ok: false, reason: 'not_configured', message: 'Add your Gemini API key in Settings to enable AI Vision.' };

    const prompt = `You are analyzing a photograph of an exam question paper for a teacher's OMR grading app.

Look at the whole page carefully and determine its real structure — do not assume a standard layout.

Return ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "numQuestions": <integer, how many questions you can actually see>,
  "numOptions": <integer, options per question, e.g. 4>,
  "optionLabels": ["A","B","C","D"],
  "hasStudentNameField": <boolean>,
  "hasRollNumberField": <boolean>,
  "notes": "<one short sentence about anything unusual about the layout, or empty string>",
  "questions": [
    {
      "index": <0-based integer>,
      "questionText": "<short summary of the question, under 140 characters, or null if illegible>",
      "options": ["<option text or letter>", ...],
      "proposedAnswer": {
        "optionIndex": <0-based integer index into options, or null if you are not confident>,
        "confidence": <number between 0 and 1, your honest confidence>,
        "reasoning": "<one short sentence explaining why, or why you are unsure>"
      }
    }
  ]
}

Rules:
- If you cannot confidently determine the correct answer to a question, set optionIndex to null and give a low confidence value and an honest reasoning — never guess just to fill every question.
- Accuracy matters far more than completeness. A teacher will review and correct every answer before it is used.
- If this image is not a readable question paper, return {"error": "<short reason>"} instead.
${expectedNumQuestions ? `- The teacher's test is currently set up for ${expectedNumQuestions} questions. If you count a different number, still report what you actually see.` : ''}`;

    try {
      const parts = [dataUrlToImagePart(imageDataUrl), { text: prompt }];
      const text = await callGemini(parts, { maxTokens: 16000, json: true });
      const parsed = extractJson(text);
      if (parsed.error) return { ok: false, reason: 'unreadable', message: parsed.error };
      if (!Array.isArray(parsed.questions) || !parsed.questions.length) {
        return { ok: false, reason: 'no_result', message: 'AI couldn\u2019t identify any questions on this page.' };
      }
      return { ok: true, ...parsed };
    } catch (e) {
      console.error('AIVision.analyzeQuestionPaper failed', e);
      return { ok: false, reason: 'error', message: 'AI reading failed (' + (e.message || 'unknown error') + '). Use manual entry below.' };
    }
  }

  // ---------------- optional "Explain" for a wrong answer ----------------
  async function explainAnswer({ questionNumber, questionText, options, studentAnswerLabel, correctAnswerLabel }) {
    if (!isOnline()) return { ok: false, message: 'AI unavailable offline' };
    if (!isConfigured()) return { ok: false, message: 'Add your Gemini API key in Settings to enable explanations.' };

    const prompt = `A student answered a multiple-choice exam question incorrectly.
Question ${questionNumber}${questionText ? ': ' + questionText : ' (question text not available)'}
${options && options.length ? 'Options: ' + options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('  ') : ''}
Student's answer: ${studentAnswerLabel}
Correct answer: ${correctAnswerLabel}

In 2-3 short sentences, explain why the correct answer is right and briefly note the likely misconception behind the student's answer. Be concise and plain-spoken. Return plain text only, no markdown, no JSON.`;

    try {
      const text = await callGemini([{ text: prompt }], { maxTokens: 2000 });
      return { ok: true, explanation: text.trim() };
    } catch (e) {
      console.error('AIVision.explainAnswer failed', e);
      return { ok: false, message: 'Couldn\u2019t generate an explanation right now.' };
    }
  }

  async function testConnection() {
    if (!isOnline()) return { ok: false, message: 'You\u2019re offline.' };
    const cfg = getConfig();
    if (!cfg.apiKey || cfg.apiKey.trim().length < 10) return { ok: false, message: 'Enter an API key first.' };
    try {
      const text = await callGemini([{ text: 'Reply with exactly: OK' }], { maxTokens: 256 });
      return { ok: true, message: text.trim() ? 'Connected to Gemini — AI Vision is ready.' : 'Connected.' };
    } catch (e) {
      return { ok: false, message: 'Connection failed: ' + (e.message || 'unknown error') };
    }
  }

  return { getConfig, setConfig, isConfigured, isOnline, analyzeQuestionPaper, explainAnswer, testConnection, DEFAULT_MODEL };
})();
