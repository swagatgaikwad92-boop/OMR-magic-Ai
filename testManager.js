/* ============================================================
   testManager.js — reusable test templates
   A "test" bundles: identity, question count/options, marking
   scheme, the approved answer key, and the OMR template used
   to generate/scan sheets for it.
   ============================================================ */

const TestManager = (() => {
  const COLLECTION = 'tests';

  function createTest({
    name, subject = '', className = '',
    numQuestions = 20, numOptions = 4,
    marksCorrect = 1, marksWrong = 0, marksUnanswered = 0, marksInvalid = 0,
    rollNumberDigits = 2, includeStudentName = true,
  }) {
    const now = new Date().toISOString();
    const test = {
      id: Storage.uid('test'),
      name: name || 'Untitled Test',
      subject, className,
      numQuestions, numOptions,
      marking: {
        correct: marksCorrect,
        wrong: marksWrong,
        unanswered: marksUnanswered,
        invalid: marksInvalid,
      },
      rollNumberDigits,
      includeStudentName,
      answerKey: new Array(numQuestions).fill(null), // 0-indexed option per question, null = not set
      answerKeyApproved: false,
      questionPaper: null, // { type: 'image'|'pdf', dataUrl } optional
      omrTemplate: null,   // generated at OMR-creation time
      createdAt: now,
      updatedAt: now,
    };
    Storage.upsert(COLLECTION, test);
    return test;
  }

  function getAll() {
    return Storage.readAll(COLLECTION).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function getById(id) {
    return Storage.getById(COLLECTION, id);
  }

  function update(id, patch) {
    const test = getById(id);
    if (!test) return null;
    const updated = { ...test, ...patch, updatedAt: new Date().toISOString() };
    Storage.upsert(COLLECTION, updated);
    return updated;
  }

  function setAnswerKey(id, answerKey, approved) {
    return update(id, { answerKey, answerKeyApproved: !!approved });
  }

  function setOmrTemplate(id, template) {
    return update(id, { omrTemplate: template });
  }

  function duplicate(id) {
    const test = getById(id);
    if (!test) return null;
    const now = new Date().toISOString();
    const copy = {
      ...test,
      id: Storage.uid('test'),
      name: test.name + ' (Copy)',
      createdAt: now,
      updatedAt: now,
    };
    Storage.upsert(COLLECTION, copy);
    return copy;
  }

  function remove(id) {
    Storage.remove(COLLECTION, id);
    ResultManager.removeByTest(id);
  }

  function isReady(test) {
    return !!test && test.answerKeyApproved && test.answerKey.some(a => a !== null);
  }

  return { createTest, getAll, getById, update, setAnswerKey, setOmrTemplate, duplicate, remove, isReady };
})();
