/* ============================================================
   studentManager.js — lightweight student identity helpers.
   OMR Magic does not maintain a global student roster; identity
   is captured per-result (name / roll number) since that's all
   a printed OMR sheet can carry. Never invent identity.
   ============================================================ */

const StudentManager = (() => {
  function normalizeIdentity({ name, rollNumber, rollConfidence }) {
    return {
      name: name ? String(name).trim() : null,
      rollNumber: (rollNumber !== undefined && rollNumber !== null && rollNumber !== '') ? String(rollNumber) : null,
      rollConfidence: typeof rollConfidence === 'number' ? rollConfidence : null,
      identityConfirmed: false, // teacher must confirm if confidence is low
    };
  }

  return { normalizeIdentity };
})();
