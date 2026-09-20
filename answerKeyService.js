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
   pipeline. Thin wrapper around aiVision.js that adapts its
   richer output into the shape the Answer Key screen consumes,
   and centralizes the "not configured / offline" fallbacks so
   callers never have to fabricate anything themselves.
   ============================================================ */

const QuestionParser = (() => {
  function isConfigured() { return AIVision.isConfigured(); }
  function isOnline() { return AIVision.isOnline(); }

  async function proposeAnswerKey(questionPaperDataUrl, numQuestions) {
    if (!questionPaperDataUrl) {
      return { ok: false, reason: 'no_image', message: 'Upload or photograph the question paper first.' };
    }
    const result = await AIVision.analyzeQuestionPaper(questionPaperDataUrl, numQuestions);
    if (!result.ok) return result;

    const proposedKey = result.questions.map(q => ({
      index: q.index,
      optionIndex: q.proposedAnswer ? q.proposedAnswer.optionIndex : null,
      confidence: q.proposedAnswer ? q.proposedAnswer.confidence : null,
      reasoning: q.proposedAnswer ? q.proposedAnswer.reasoning : null,
      questionText: q.questionText || null,
      source: 'ai_inferred',
    }));

    return {
      ok: true,
      proposedKey,
      detectedNumQuestions: result.numQuestions,
      detectedNumOptions: result.numOptions,
      hasStudentNameField: result.hasStudentNameField,
      hasRollNumberField: result.hasRollNumberField,
      notes: result.notes || '',
    };
  }

  return { proposeAnswerKey, isConfigured, isOnline };
})();

