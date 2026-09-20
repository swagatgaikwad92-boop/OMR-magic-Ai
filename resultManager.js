/* ============================================================
   resultManager.js — persistence + aggregate insights for
   graded student results.
   ============================================================ */

const ResultManager = (() => {
  const COLLECTION = 'results';

  function saveResult({ testId, identity, graded, scanQuality, sheetFingerprint, imageThumb }) {
    const result = {
      id: Storage.uid('res'),
      testId,
      identity, // { name, rollNumber, rollConfidence, identityConfirmed }
      graded,   // output of GradingEngine.grade (mutable, holds corrections)
      scanQuality,
      sheetFingerprint, // for duplicate detection
      imageThumb: imageThumb || null,
      scannedAt: new Date().toISOString(),
    };
    Storage.upsert(COLLECTION, result);
    return result;
  }

  function updateResult(id, patch) {
    const r = Storage.getById(COLLECTION, id);
    if (!r) return null;
    const updated = { ...r, ...patch };
    Storage.upsert(COLLECTION, updated);
    return updated;
  }

  function getById(id) { return Storage.getById(COLLECTION, id); }

  function getByTest(testId) {
    return Storage.readAll(COLLECTION)
      .filter(r => r.testId === testId)
      .sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
  }

  function removeByTest(testId) {
    Storage.removeWhere(COLLECTION, r => r.testId === testId);
  }

  function remove(id) { Storage.remove(COLLECTION, id); }

  function findPossibleDuplicate(testId, fingerprint, rollNumber) {
    const existing = getByTest(testId);
    return existing.find(r =>
      (fingerprint && r.sheetFingerprint && r.sheetFingerprint === fingerprint) ||
      (rollNumber && r.identity && r.identity.rollNumber && r.identity.rollNumber === rollNumber)
    ) || null;
  }

  function insightsForTest(testId) {
    const results = getByTest(testId);
    const test = TestManager.getById(testId);
    if (!results.length || !test) {
      return { count: 0, average: 0, highest: 0, lowest: 0, median: 0, questionStats: [] };
    }
    const scores = results.map(r => r.graded.score).sort((a, b) => a - b);
    const sum = scores.reduce((a, b) => a + b, 0);
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;

    const questionStats = [];
    for (let qi = 0; qi < test.numQuestions; qi++) {
      let correctCount = 0, wrongCount = 0, unansweredCount = 0, unclearCount = 0;
      const optionTally = new Array(test.numOptions).fill(0);
      results.forEach(r => {
        const pq = r.graded.perQuestion[qi];
        if (!pq) return;
        if (pq.outcome === 'correct') correctCount++;
        else if (pq.outcome === 'wrong' || pq.outcome === 'invalid') wrongCount++;
        else if (pq.outcome === 'unanswered') unansweredCount++;
        else if (pq.outcome === 'unclear') unclearCount++;
        if (pq.detected !== null && pq.detected !== undefined && pq.detected >= 0) optionTally[pq.detected]++;
      });
      const accuracy = results.length ? Math.round((correctCount / results.length) * 1000) / 10 : 0;
      questionStats.push({ index: qi, correctCount, wrongCount, unansweredCount, unclearCount, accuracy, optionTally });
    }
    const mostMissed = [...questionStats].sort((a, b) => a.accuracy - b.accuracy).slice(0, 5).filter(q => q.accuracy < 100);

    return {
      count: results.length,
      average: Math.round((sum / scores.length) * 10) / 10,
      highest: scores[scores.length - 1],
      lowest: scores[0],
      median: Math.round(median * 10) / 10,
      questionStats,
      mostMissed,
    };
  }

  return { saveResult, updateResult, getById, getByTest, removeByTest, remove, findPossibleDuplicate, insightsForTest };
})();
