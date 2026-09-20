/* ============================================================
   answerKeyService.js — everything to do with building and
   validating an answer key. Two paths:
     1. Manual (fully offline, always available) — teacher taps
        the correct option for each question.
     2. AI-assisted (questionParser.js) — proposes a key from an
        uploaded question paper. Requires network + a configured
        AI endpoint; every proposed answer still needs teacher
        approval before the test can go live.
   ============================================================ */

const AnswerKeyService = (() => {
  function emptyKey(numQuestions) {
    return new Array(numQuestions).fill(null);
  }

  function setAnswer(key, index, optionIndex) {
    const copy = key.slice();
    copy[index] = optionIndex;
    return copy;
  }

  function completionStats(key) {
    const total = key.length;
    const filled = key.filter(k => k !== null && k !== undefined).length;
    return { total, filled, remaining: total - filled, complete: filled === total };
  }

  function canApprove(key) {
    return completionStats(key).complete;
  }

  return { emptyKey, setAnswer, completionStats, canApprove };
})();


/* ============================================================
   questionParser.js — AI-assisted question paper -> answer key
   pipeline interface.

   HONESTY NOTE: OMR Magic does not ship with a hardcoded AI
   provider or API key. This module defines the clean pipeline
   interface described in the product spec (OCR -> segmentation
   -> option extraction -> reasoning -> proposed key), but the
   actual model call is left as a single swappable function,
   `callAIProvider`, that a deployer can wire up to whatever
   service they choose. Until it's configured, or when the
   device is offline, this module reports itself unavailable
   rather than pretending to work — no random or fabricated
   answers are ever produced.
   ============================================================ */

const QuestionParser = (() => {
  // Deployers: replace this function to call your AI provider of choice.
  // It must return null (not throw) if not configured, so the UI can
  // fall back to manual entry cleanly.
  async function callAIProvider(/* imageOrPdfDataUrl */) {
    return null; // not configured in this build
  }

  function isConfigured() {
    // Overwrite / detect real configuration here once an endpoint exists.
    return false;
  }

  function isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  async function proposeAnswerKey(questionPaperDataUrl, numQuestions) {
    if (!isOnline()) {
      return { ok: false, reason: 'offline', message: 'AI unavailable offline' };
    }
    if (!isConfigured()) {
      return { ok: false, reason: 'not_configured', message: 'AI question reading isn\u2019t set up on this deployment yet. Use manual entry below.' };
    }
    try {
      const result = await callAIProvider(questionPaperDataUrl);
      if (!result) return { ok: false, reason: 'no_result', message: 'Couldn\u2019t read the question paper. Use manual entry below.' };
      // Expected shape from a real provider: { answers: [{index, optionIndex, confidence}], questionCount }
      return { ok: true, proposedKey: result.answers, questionCount: result.questionCount };
    } catch (e) {
      return { ok: false, reason: 'error', message: 'AI reading failed. Use manual entry below.' };
    }
  }

  return { proposeAnswerKey, isConfigured, isOnline };
})();
