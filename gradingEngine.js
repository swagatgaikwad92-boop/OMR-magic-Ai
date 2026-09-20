/* ============================================================
   gradingEngine.js — turns detected answers + an answer key
   into a scored result. Pure logic, no UI, no storage.
   ============================================================ */

const GradingEngine = (() => {
  // detectedAnswers[i] shape: { option: number|null, status: 'answered'|'blank'|'multiple'|'unclear', confidence: 0..1 }
  // answerKey[i]: number|null (index of correct option)
  function grade(detectedAnswers, answerKey, marking) {
    const n = answerKey.length;
    const perQuestion = [];
    let correct = 0, wrong = 0, unanswered = 0, unclear = 0, score = 0;

    for (let i = 0; i < n; i++) {
      const det = detectedAnswers[i] || { option: null, status: 'blank', confidence: 0 };
      const key = answerKey[i];
      let outcome, marks = 0;

      if (det.status === 'unclear') {
        outcome = 'unclear'; unclear++; marks = 0;
      } else if (det.status === 'multiple') {
        outcome = 'invalid'; wrong++; marks = marking.invalid || 0;
      } else if (det.status === 'blank' || det.option === null) {
        outcome = 'unanswered'; unanswered++; marks = marking.unanswered || 0;
      } else if (key === null || key === undefined) {
        outcome = 'unkeyed'; marks = 0;
      } else if (det.option === key) {
        outcome = 'correct'; correct++; marks = marking.correct || 0;
      } else {
        outcome = 'wrong'; wrong++; marks = marking.wrong || 0;
      }

      score += marks;
      perQuestion.push({
        index: i,
        detected: det.option,
        status: det.status,
        confidence: det.confidence,
        reason: det.reason || null,               // why a question was flagged (disagree / low / range / missing)
        suggested: det.suggested === undefined ? null : det.suggested, // AI's best guess for flagged questions
        suggestedBlank: !!det.suggestedBlank,
        correctOption: key,
        outcome,
        marks,
        corrected: false, // set true if a teacher manually overrides later
      });
    }

    const maxScore = n * (marking.correct || 0);
    const percentage = maxScore > 0 ? Math.max(0, (score / maxScore) * 100) : 0;
    const avgConfidence = detectedAnswers.length
      ? detectedAnswers.reduce((s, d) => s + (d.confidence || 0), 0) / detectedAnswers.length
      : 0;

    return {
      perQuestion, score, maxScore,
      percentage: Math.round(percentage * 10) / 10,
      correct, wrong, unanswered, unclear,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
    };
  }

  // Re-grade after a teacher manually edits one question's detected answer.
  function regradeQuestion(gradedResult, index, newOption, marking, answerKey) {
    const pq = gradedResult.perQuestion[index];
    const prevOutcome = pq.outcome;
    const prevMarks = pq.marks;

    const key = answerKey[index];
    let outcome, marks;
    if (newOption === null) {
      outcome = 'unanswered'; marks = marking.unanswered || 0;
    } else if (key !== null && key !== undefined && newOption === key) {
      outcome = 'correct'; marks = marking.correct || 0;
    } else {
      outcome = 'wrong'; marks = marking.wrong || 0;
    }

    pq.detected = newOption;
    pq.status = newOption === null ? 'blank' : 'answered';
    pq.outcome = outcome;
    pq.marks = marks;
    pq.corrected = true;
    pq.confidence = 1;

    // adjust aggregate counters
    const bump = (field, delta) => { gradedResult[field] = (gradedResult[field] || 0) + delta; };
    if (prevOutcome === 'correct') bump('correct', -1);
    if (prevOutcome === 'wrong' || prevOutcome === 'invalid') bump('wrong', -1);
    if (prevOutcome === 'unanswered') bump('unanswered', -1);
    if (prevOutcome === 'unclear') bump('unclear', -1);
    if (outcome === 'correct') bump('correct', 1);
    if (outcome === 'wrong') bump('wrong', 1);
    if (outcome === 'unanswered') bump('unanswered', 1);

    gradedResult.score = gradedResult.score - prevMarks + marks;
    gradedResult.percentage = gradedResult.maxScore > 0
      ? Math.round(Math.max(0, (gradedResult.score / gradedResult.maxScore) * 100) * 10) / 10
      : 0;

    return gradedResult;
  }

  return { grade, regradeQuestion };
})();
