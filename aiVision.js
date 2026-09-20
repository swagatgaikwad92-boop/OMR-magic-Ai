/* ============================================================
   aiVision.js — real AI vision integration (Stages A/B and the
   optional "Explain" feature from the product spec).

   Honesty note: OMR Magic does not ship an API key. The teacher
   supplies their own Claude API key in Settings, stored only in
   this browser's localStorage — never in source code, never sent
   anywhere but api.anthropic.com. Calls go directly from the
   browser using Anthropic's documented direct-browser-access
   header, which exists precisely for "bring your own key" apps
   like this one (there is no backend to proxy through in a
   static GitHub Pages deployment). If no key is configured, or
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
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const DEFAULT_MODEL = 'claude-sonnet-5';

  function getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : { apiKey: '', model: DEFAULT_MODEL, enabled: false };
    } catch (e) {
      return { apiKey: '', model: DEFAULT_MODEL, enabled: false };
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

  async function callClaude(messages, maxTokens = 2000) {
    const cfg = getConfig();
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: cfg.model || DEFAULT_MODEL, max_tokens: maxTokens, messages }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  function extractJson(text) {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in AI response');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function dataUrlToImageBlock(dataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
    if (!match) throw new Error('Unsupported image format');
    return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
  }

  // ---------------- Stage A/B: question paper -> proposed answer key ----------------
  async function analyzeQuestionPaper(imageDataUrl, expectedNumQuestions) {
    if (!isOnline()) return { ok: false, reason: 'offline', message: 'AI unavailable offline' };
    if (!isConfigured()) return { ok: false, reason: 'not_configured', message: 'Add your Claude API key in Settings to enable AI Vision.' };

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
      const content = [dataUrlToImageBlock(imageDataUrl), { type: 'text', text: prompt }];
      const text = await callClaude([{ role: 'user', content }], 6000);
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
    if (!isConfigured()) return { ok: false, message: 'Add your Claude API key in Settings to enable explanations.' };

    const prompt = `A student answered a multiple-choice exam question incorrectly.
Question ${questionNumber}${questionText ? ': ' + questionText : ' (question text not available)'}
${options && options.length ? 'Options: ' + options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('  ') : ''}
Student's answer: ${studentAnswerLabel}
Correct answer: ${correctAnswerLabel}

In 2-3 short sentences, explain why the correct answer is right and briefly note the likely misconception behind the student's answer. Be concise and plain-spoken. Return plain text only, no markdown, no JSON.`;

    try {
      const text = await callClaude([{ role: 'user', content: prompt }], 400);
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
      const text = await callClaude([{ role: 'user', content: 'Reply with exactly: OK' }], 10);
      return { ok: true, message: text.trim() ? 'Connected — AI Vision is ready.' : 'Connected.' };
    } catch (e) {
      return { ok: false, message: 'Connection failed: ' + (e.message || 'unknown error') };
    }
  }

  return { getConfig, setConfig, isConfigured, isOnline, analyzeQuestionPaper, explainAnswer, testConnection, DEFAULT_MODEL };
})();
