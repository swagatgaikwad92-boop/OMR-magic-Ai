/* ============================================================
   batchScanner.js — tracks a multi-sheet scanning session for
   one test. The actual scanning UI reuses the same Magic Mode
   scanner screen; this module just keeps the running count and
   per-sheet outcomes.
   ============================================================ */

const BatchScanner = (() => {
  function createSession(testId, targetCount) {
    return {
      testId,
      targetCount: targetCount || null,
      completed: [], // { resultId, identity, score, percentage, timestamp }
      startedAt: new Date().toISOString(),
    };
  }

  function recordSheet(session, result) {
    session.completed.push({
      resultId: result.id,
      identity: result.identity,
      score: result.graded.score,
      maxScore: result.graded.maxScore,
      percentage: result.graded.percentage,
      timestamp: result.scannedAt,
    });
    return session;
  }

  function progressLabel(session) {
    return session.targetCount
      ? `${session.completed.length} / ${session.targetCount} sheets`
      : `${session.completed.length} sheets scanned`;
  }

  return { createSession, recordSheet, progressLabel };
})();
