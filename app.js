/* ============================================================
   app.js — application shell, router, and screen rendering.
   Vanilla JS, no build step, no modules — a single classic
   script so every function below shares one global scope and
   can call any other directly (kept as one growing file rather
   than split across modules to avoid import/export tooling).
   ============================================================ */

let currentCleanup = null; // called before leaving a screen with live resources (camera etc.)
let toastTimer = null;
window.__navStack = [];

const Forms = { createTest: null };

function root() { return document.getElementById('app'); }

function setCleanup(fn) { currentCleanup = fn; }

// ---------------- router ----------------
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  return { name: parts[0] || 'home', params: parts.slice(1) };
}

function navigate(hash) { location.hash = hash; }

function goBack(fallback) {
  navigate(fallback || '#/home');
}

function renderRoute() {
  if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch (e) { console.error(e); } }
  currentCleanup = null;
  const { name, params } = parseHash();

  switch (name) {
    case 'home': return renderHome();
    case 'history': return renderHistory();
    case 'test': return renderTestDetail(params[0]);
    case 'create-test': return renderCreateTest();
    case 'answer-key': return renderAnswerKey(params[0]);
    case 'omr-sheet': return renderOmrSheet(params[0]);
    case 'scan': return renderScan(params[0], 'single');
    case 'batch': return renderScan(params[0], 'batch');
    case 'result': return renderResult(params[0]);
    case 'settings': return renderSettings();
    default: return renderHome();
  }
}

window.addEventListener('hashchange', renderRoute);
window.addEventListener('DOMContentLoaded', () => {
  initGlobalDelegation();
  renderRoute();
});

// ---------------- shared chrome ----------------
function topbar(title, opts = {}) {
  return `
    <div class="topbar">
      ${opts.noBack ? '' : `<div class="back-btn" data-action="back" role="button" aria-label="Back">${iconChevronLeft()}</div>`}
      <h1>${title}</h1>
      <div class="topbar-spacer"></div>
      ${opts.right || ''}
    </div>`;
}

function bgBubbles() {
  return `<div class="bg-bubbles" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`;
}

function toast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

function openSheet(innerHtml, opts = {}) {
  closeSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sheet-handle"></div>${innerHtml}`;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  if (!opts.persistent) backdrop.addEventListener('click', closeSheet);
  return sheet;
}

function closeSheet() {
  document.querySelectorAll('.sheet-backdrop, .sheet').forEach(el => el.remove());
}

// ---------------- icons ----------------
function iconChevronLeft() { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function iconChevronRight() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function iconGear() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a1.7 1.7 0 000-3l-1-.2a6.8 6.8 0 00-.6-1.4l.5-.9a1.7 1.7 0 00-2.3-2.3l-.9.5a6.8 6.8 0 00-1.4-.6l-.2-1a1.7 1.7 0 00-3 0l-.2 1a6.8 6.8 0 00-1.4.6l-.9-.5a1.7 1.7 0 00-2.3 2.3l.5.9a6.8 6.8 0 00-.6 1.4l-1 .2a1.7 1.7 0 000 3l1 .2c.14.5.34.97.6 1.4l-.5.9a1.7 1.7 0 002.3 2.3l.9-.5c.43.26.9.46 1.4.6l.2 1a1.7 1.7 0 003 0l.2-1c.5-.14.97-.34 1.4-.6l.9.5a1.7 1.7 0 002.3-2.3l-.5-.9c.26-.43.46-.9.6-1.4l1-.2z" stroke="currentColor" stroke-width="1.6"/></svg>`; }

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(iso) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function scoreEmoji(pct) { return pct >= 85 ? '🌟' : pct >= 60 ? '✅' : pct >= 40 ? '🙂' : '📄'; }

// ================================================================
// HOME
// ================================================================
function renderHome() {
  root().innerHTML = `
    ${bgBubbles()}
    <div class="screen">
      <div class="flex" style="justify-content:flex-end;">
        <div class="back-btn" data-action="goto" data-href="#/settings" aria-label="Settings">${iconGear()}</div>
      </div>
      <div class="home-hero">
        <div class="magic-orb" aria-hidden="true"></div>
        <p class="brand">OMR Magic</p>
        <p class="tagline">Scan. Understand. Check.</p>
        <div class="mt-12" id="ai-status-pill"></div>
      </div>

      <button class="btn btn-primary btn-block" data-action="start-test" style="font-size:17px; padding:19px;">Start a test ${iconChevronRight()}</button>

      <div class="quick-actions">
        <div class="qa" data-action="quick-scan" tabindex="0"><span class="qa-icon">📷</span>Scan OMR</div>
        <div class="qa" data-action="goto" data-href="#/history" tabindex="0"><span class="qa-icon">🗂️</span>Past tests</div>
        <div class="qa" data-action="goto" data-href="#/create-test" tabindex="0"><span class="qa-icon">✨</span>Create OMR</div>
        <div class="qa" data-action="goto" data-href="#/settings" tabindex="0"><span class="qa-icon">🔒</span>Privacy</div>
      </div>

      <div class="feature-grid">
        <div class="feat"><div class="fi">⚡</div><div class="ft">Live checking</div></div>
        <div class="feat"><div class="fi">📷</div><div class="ft">Camera scanning</div></div>
        <div class="feat"><div class="fi">📊</div><div class="ft">Instant results</div></div>
        <div class="feat"><div class="fi">✨</div><div class="ft">AI-ready</div></div>
      </div>
    </div>
  `;
  const pillEl = document.getElementById('ai-status-pill');
  const aiOn = AIVision.isConfigured();
  pillEl.innerHTML = `<span class="ai-pill ${aiOn ? '' : 'offline'}"><span class="dot"></span>${aiOn ? 'AI Vision Ready' : 'AI Vision off \u2014 set up in Settings'}</span>`;
}

function readyTestsList() {
  return TestManager.getAll().filter(t => TestManager.isReady(t));
}

function handleStartTest() {
  const ready = readyTestsList();
  if (!ready.length) { navigate('#/create-test'); return; }
  pickTestSheet('Start a test', ready, (id) => navigate(`#/test/${id}`));
}

function handleQuickScan() {
  const ready = readyTestsList();
  if (!ready.length) {
    toast('Set up a test with an approved answer key first');
    navigate('#/create-test');
    return;
  }
  if (ready.length === 1) { navigate(`#/scan/${ready[0].id}`); return; }
  pickTestSheet('Scan which test?', ready, (id) => navigate(`#/scan/${id}`));
}

function pickTestSheet(title, tests, onPick) {
  const sheet = openSheet(`
    <div class="section-title" style="margin-top:0;">${title}</div>
    <div class="list mb-16">
      ${tests.slice(0, 8).map(t => `
        <div class="list-item" data-pick-test="${t.id}">
          <div class="li-icon">📋</div>
          <div class="li-main"><div class="li-title">${escapeHtml(t.name)}</div><div class="li-sub">${escapeHtml(t.subject || 'No subject')} · ${t.numQuestions} questions</div></div>
          <div class="li-chev">${iconChevronRight()}</div>
        </div>`).join('')}
    </div>
    <button class="btn btn-glass btn-block" data-action="goto" data-href="#/create-test">+ New test</button>
  `);
  sheet.querySelectorAll('[data-pick-test]').forEach(el => {
    el.addEventListener('click', () => { closeSheet(); onPick(el.getAttribute('data-pick-test')); });
  });
}

// ================================================================
// HISTORY (tests overview)
// ================================================================
function renderHistory() {
  const tests = TestManager.getAll();
  root().innerHTML = `
    ${bgBubbles()}
    ${topbar('Past tests')}
    <div class="screen" style="padding-top:4px;">
      ${tests.length ? `<div class="list">${tests.map(renderHistoryItem).join('')}</div>` : `
        <div class="empty-state">
          <div class="es-icon">🗂️</div>
          <div class="es-title">No tests yet</div>
          <div class="es-sub">Create your first test and OMR Magic will keep every result here.</div>
        </div>`}
      <button class="btn btn-primary btn-block mt-20" data-action="goto" data-href="#/create-test">+ Create a test</button>
    </div>
  `;
}

function renderHistoryItem(t) {
  const results = ResultManager.getByTest(t.id);
  const insights = results.length ? ResultManager.insightsForTest(t.id) : null;
  return `
    <div class="list-item" data-action="goto" data-href="#/test/${t.id}">
      <div class="li-icon">📋</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(t.name)}</div>
        <div class="li-sub">${results.length} student${results.length === 1 ? '' : 's'}${insights ? ` · Average ${insights.average}` : ''} · ${timeAgo(t.updatedAt)}</div>
      </div>
      <div class="li-chev">${iconChevronRight()}</div>
    </div>`;
}

// ================================================================
// TEST DETAIL
// ================================================================
function renderTestDetail(testId) {
  const test = TestManager.getById(testId);
  if (!test) { navigate('#/history'); return; }
  const results = ResultManager.getByTest(testId);
  const insights = ResultManager.insightsForTest(testId);
  const ready = TestManager.isReady(test);

  root().innerHTML = `
    ${bgBubbles()}
    ${topbar(test.name, { right: `<div class="back-btn" data-action="test-menu" data-id="${test.id}">⋯</div>` })}
    <div class="screen" style="padding-top:4px;">
      <div class="glass glass-panel mb-16">
        <div class="flex" style="justify-content:space-between; align-items:flex-start;">
          <div>
            <div class="fw" style="font-size:16px;">${escapeHtml(test.name)}</div>
            <div class="muted small mt-8">${escapeHtml(test.subject || 'No subject')} ${test.className ? '· ' + escapeHtml(test.className) : ''}</div>
          </div>
          ${ready ? '<span class="badge badge-success">Ready</span>' : '<span class="badge badge-amber">Key needed</span>'}
        </div>
        <div class="flex gap-12 mt-16" style="flex-wrap:wrap;">
          <span class="badge badge-neutral">${test.numQuestions} questions</span>
          <span class="badge badge-neutral">${test.numOptions} options</span>
          <span class="badge badge-neutral">+${test.marking.correct} / ${test.marking.wrong}</span>
        </div>
      </div>

      ${!ready ? `
        <div class="banner banner-warn mb-16">Approve the answer key before scanning. <span style="font-weight:800; cursor:pointer; text-decoration:underline;" data-action="goto" data-href="#/answer-key/${test.id}">Set it up →</span></div>
      ` : ''}

      <div class="quick-actions">
        <div class="qa" data-action="${ready ? 'goto' : 'need-key'}" data-href="#/scan/${test.id}" data-id="${test.id}" style="${ready ? '' : 'opacity:0.45;'}"><span class="qa-icon">✨</span>Scan OMR</div>
        <div class="qa" data-action="${ready ? 'goto' : 'need-key'}" data-href="#/batch/${test.id}" data-id="${test.id}" style="${ready ? '' : 'opacity:0.45;'}"><span class="qa-icon">🗂️</span>Batch scan</div>
        <div class="qa" data-action="goto" data-href="#/answer-key/${test.id}"><span class="qa-icon">🔑</span>Answer key</div>
        <div class="qa" data-action="goto" data-href="#/omr-sheet/${test.id}"><span class="qa-icon">🖨️</span>OMR sheet</div>
      </div>

      ${insights.count ? `
        <div class="section-title">Class insights</div>
        <div class="stat-grid">
          <div class="sg-item"><div class="sg-num">${insights.count}</div><div class="sg-label">STUDENTS</div></div>
          <div class="sg-item"><div class="sg-num">${insights.average}</div><div class="sg-label">AVERAGE</div></div>
          <div class="sg-item"><div class="sg-num">${insights.highest}</div><div class="sg-label">HIGHEST</div></div>
          <div class="sg-item"><div class="sg-num">${insights.lowest}</div><div class="sg-label">LOWEST</div></div>
        </div>
        ${insights.mostMissed && insights.mostMissed.length ? `
          <div class="section-title">Most missed</div>
          <div class="glass glass-panel analytics-glass">
            ${insights.mostMissed.map(m => `
              <div class="flex" style="justify-content:space-between; padding:8px 0;">
                <span class="fw small">Question ${m.index + 1}</span>
                <span class="muted small">${(100 - m.accuracy).toFixed(1)}% missed</span>
              </div>`).join('')}
          </div>
        ` : ''}
      ` : ''}

      <div class="section-title">Results ${results.length ? `(${results.length})` : ''}</div>
      ${results.length ? `
        <div class="list">
          ${results.map(r => `
            <div class="list-item" data-action="goto" data-href="#/result/${r.id}">
              <div class="li-icon">${scoreEmoji(r.graded.percentage)}</div>
              <div class="li-main">
                <div class="li-title">${escapeHtml(r.identity.name || (r.identity.rollNumber ? 'Roll No. ' + r.identity.rollNumber : 'Unnamed student'))}</div>
                <div class="li-sub">${r.graded.score}/${r.graded.maxScore} · ${r.graded.percentage}%</div>
              </div>
              <div class="li-chev">${iconChevronRight()}</div>
            </div>`).join('')}
        </div>
        <button class="btn btn-glass btn-block mt-16" data-action="export-csv" data-id="${test.id}">Export CSV</button>
      ` : `
        <div class="empty-state">
          <div class="es-icon">📭</div>
          <div class="es-title">No results yet</div>
          <div class="es-sub">Scan a student's OMR sheet to see it appear here instantly.</div>
        </div>
      `}
    </div>
  `;
}

function openTestMenu(testId) {
  const test = TestManager.getById(testId);
  if (!test) return;
  openSheet(`
    <div class="section-title" style="margin-top:0;">${escapeHtml(test.name)}</div>
    <div class="list">
      <div class="list-item" data-action="duplicate-test" data-id="${test.id}"><div class="li-icon">📄</div><div class="li-main"><div class="li-title">Duplicate test</div></div></div>
      <div class="list-item" data-action="rename-test" data-id="${test.id}"><div class="li-icon">✏️</div><div class="li-main"><div class="li-title">Rename</div></div></div>
      <div class="list-item" data-action="delete-test" data-id="${test.id}"><div class="li-icon">🗑️</div><div class="li-main"><div class="li-title" style="color:var(--danger);">Delete test</div></div></div>
    </div>
  `);
}

// ================================================================
// CREATE TEST
// ================================================================
function renderCreateTest() {
  Forms.createTest = Forms.createTest || {
    name: '', subject: '', className: '',
    numQuestions: 20, numOptions: 4,
    marksCorrect: 1, marksWrong: 0, marksUnanswered: 0, marksInvalid: 0,
    rollNumberDigits: 2, includeStudentName: true,
  };
  const f = Forms.createTest;

  root().innerHTML = `
    ${bgBubbles()}
    ${topbar('New test')}
    <div class="screen" style="padding-top:4px;">
      <div class="field">
        <label>Test name</label>
        <input type="text" id="f-name" placeholder="e.g. Physics Unit Test 1" value="${escapeHtml(f.name)}">
      </div>
      <div class="field-row">
        <div class="field"><label>Subject</label><input type="text" id="f-subject" placeholder="Physics" value="${escapeHtml(f.subject)}"></div>
        <div class="field"><label>Class</label><input type="text" id="f-class" placeholder="Grade 10" value="${escapeHtml(f.className)}"></div>
      </div>

      <div class="section-title">Questions</div>
      <div class="glass glass-panel">
        <div class="field" style="margin-bottom:16px;">
          <label>Number of questions</label>
          <div class="stepper">
            <button data-step="numQuestions" data-delta="-1">−</button>
            <div class="stepper-val" id="v-numQuestions">${f.numQuestions}</div>
            <button data-step="numQuestions" data-delta="1">+</button>
          </div>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Options per question</label>
          <div class="option-pills" id="p-numOptions">
            ${[2,3,4,5].map(n => `<div class="pill ${f.numOptions===n?'active':''}" data-set="numOptions" data-value="${n}">${n}</div>`).join('')}
          </div>
        </div>
      </div>

      <div class="section-title">Marking scheme</div>
      <div class="glass glass-panel">
        <div class="field-row">
          <div class="field"><label>Correct</label><input type="number" id="f-marksCorrect" value="${f.marksCorrect}" step="0.5"></div>
          <div class="field"><label>Wrong</label><input type="number" id="f-marksWrong" value="${f.marksWrong}" step="0.5"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Unanswered</label><input type="number" id="f-marksUnanswered" value="${f.marksUnanswered}" step="0.5"></div>
          <div class="field"><label>Multiple/invalid</label><input type="number" id="f-marksInvalid" value="${f.marksInvalid}" step="0.5"></div>
        </div>
      </div>

      <div class="section-title">Student identity</div>
      <div class="glass glass-panel">
        <div class="toggle-row">
          <div><div class="tr-label">Student name field</div><div class="tr-sub">Blank line for the student to write on</div></div>
          <div class="switch ${f.includeStudentName ? 'on' : ''}" id="sw-name"></div>
        </div>
        <div class="field" style="margin:12px 0 0;">
          <label>Roll number digits (0 = no roll number)</label>
          <div class="stepper">
            <button data-step="rollNumberDigits" data-delta="-1">−</button>
            <div class="stepper-val" id="v-rollNumberDigits">${f.rollNumberDigits}</div>
            <button data-step="rollNumberDigits" data-delta="1">+</button>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-block mt-24" data-action="save-create-test">Continue → Answer key</button>
    </div>
  `;

  bindNumberField('f-marksCorrect', 'marksCorrect');
  bindNumberField('f-marksWrong', 'marksWrong');
  bindNumberField('f-marksUnanswered', 'marksUnanswered');
  bindNumberField('f-marksInvalid', 'marksInvalid');
  document.getElementById('f-name').addEventListener('input', e => f.name = e.target.value);
  document.getElementById('f-subject').addEventListener('input', e => f.subject = e.target.value);
  document.getElementById('f-class').addEventListener('input', e => f.className = e.target.value);
  document.getElementById('sw-name').addEventListener('click', (e) => {
    f.includeStudentName = !f.includeStudentName;
    e.target.classList.toggle('on', f.includeStudentName);
  });
  document.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-step');
      const delta = parseInt(btn.getAttribute('data-delta'), 10);
      const min = key === 'numQuestions' ? 1 : 0;
      const max = key === 'numQuestions' ? 200 : 8;
      f[key] = Math.max(min, Math.min(max, f[key] + delta));
      document.getElementById('v-' + key).textContent = f[key];
    });
  });
  document.querySelectorAll('[data-set="numOptions"]').forEach(p => {
    p.addEventListener('click', () => {
      f.numOptions = parseInt(p.getAttribute('data-value'), 10);
      document.querySelectorAll('[data-set="numOptions"]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
    });
  });

  function bindNumberField(id, key) {
    document.getElementById(id).addEventListener('input', e => { f[key] = parseFloat(e.target.value) || 0; });
  }
}

function handleSaveCreateTest() {
  const f = Forms.createTest;
  if (!f.name.trim()) { toast('Give the test a name'); return; }
  const test = TestManager.createTest({
    name: f.name.trim(), subject: f.subject.trim(), className: f.className.trim(),
    numQuestions: f.numQuestions, numOptions: f.numOptions,
    marksCorrect: f.marksCorrect, marksWrong: f.marksWrong,
    marksUnanswered: f.marksUnanswered, marksInvalid: f.marksInvalid,
    rollNumberDigits: f.rollNumberDigits, includeStudentName: f.includeStudentName,
  });
  Forms.createTest = null;
  navigate(`#/answer-key/${test.id}`);
}

// ================================================================
// ANSWER KEY
// ================================================================
function renderAnswerKey(testId) {
  const test = TestManager.getById(testId);
  if (!test) { navigate('#/history'); return; }
  Forms.answerKeyDraft = Forms.answerKeyDraft && Forms.answerKeyDraft.testId === testId
    ? Forms.answerKeyDraft
    : { testId, key: test.answerKey.slice(), meta: (test.answerKeyMeta && test.answerKeyMeta.length === test.numQuestions) ? test.answerKeyMeta.slice() : new Array(test.numQuestions).fill(null) };
  const draft = Forms.answerKeyDraft;
  const stats = AnswerKeyService.completionStats(draft.key);
  const aiReady = AIVision.isConfigured();

  root().innerHTML = `
    ${bgBubbles()}
    ${topbar('Answer key')}
    <div class="screen" style="padding-top:4px;">
      ${test.answerKeyApproved ? `<div class="banner banner-info mb-16">✓ This answer key is approved and the test is ready to scan.</div>` : ''}

      <div class="glass glass-panel mb-16">
        <div class="flex" style="justify-content:space-between; align-items:center;">
          <div class="fw">Manual entry</div>
          <div class="muted small">${stats.filled}/${stats.total} set</div>
        </div>
        <div class="muted small mt-8">Tap the correct option for each question. Works completely offline.</div>
      </div>

      <div class="banner banner-ai mb-16" id="ai-banner" style="display:none;"></div>
      <button class="btn btn-glass btn-block mb-16" data-action="ai-propose-key" data-id="${test.id}">
        ${aiReady ? '✨ Let AI read the question paper' : '✨ AI question reading (set up in Settings)'}
      </button>

      <div class="akey-grid" id="akey-grid">
        ${test.answerKey.map((_, i) => renderAkeyRow(i, draft.key[i], test.numOptions, draft.meta[i])).join('')}
      </div>

      <button class="btn btn-primary btn-block mt-24" data-action="approve-key" data-id="${test.id}" ${stats.complete ? '' : 'disabled'}>
        ${stats.complete ? 'Approve answer key' : `Set ${stats.remaining} more answer${stats.remaining === 1 ? '' : 's'}`}
      </button>
    </div>
  `;

  wireAkeyGrid(testId);
}

function wireAkeyGrid(testId) {
  const draft = Forms.answerKeyDraft;
  document.getElementById('akey-grid').querySelectorAll('.akey-opt').forEach(el => {
    el.addEventListener('click', () => {
      const q = parseInt(el.getAttribute('data-q'), 10);
      const o = parseInt(el.getAttribute('data-o'), 10);
      draft.key = AnswerKeyService.setAnswer(draft.key, q, o);
      draft.meta[q] = { source: 'manual', confidence: null, reasoning: null, questionText: draft.meta[q] ? draft.meta[q].questionText : null };
      renderAnswerKey(testId);
    });
  });
  document.getElementById('akey-grid').querySelectorAll('[data-info-q]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const q = parseInt(el.getAttribute('data-info-q'), 10);
      const m = draft.meta[q];
      openSheet(`
        <div class="section-title" style="margin-top:0;">Question ${q + 1} — AI reasoning</div>
        ${m && m.questionText ? `<div class="muted small mb-8">${escapeHtml(m.questionText)}</div>` : ''}
        <div class="explain-box">${escapeHtml(m && m.reasoning ? m.reasoning : 'No reasoning provided.')}</div>
        ${m && m.confidence !== null && m.confidence !== undefined ? `<div class="muted small mt-12">AI confidence: ${Math.round(m.confidence * 100)}%</div>` : ''}
      `);
    });
  });
}

function renderAkeyRow(qIndex, selected, numOptions, meta) {
  const isAi = meta && meta.source === 'ai_inferred';
  const conf = isAi && meta.confidence !== null && meta.confidence !== undefined ? Math.round(meta.confidence * 100) : null;
  const confColor = conf === null ? 'var(--neutral)' : conf >= 75 ? 'var(--mint)' : conf >= 45 ? 'var(--banana)' : 'var(--coral)';
  return `
    <div class="akey-row ${isAi ? 'src-ai' : ''}">
      <div class="akey-q">Q${qIndex + 1}${isAi ? `<span class="akey-source-tag badge-ai" data-info-q="${qIndex}">AI</span>` : ''}</div>
      <div class="akey-opts">
        ${Array.from({ length: numOptions }).map((_, o) => `
          <div class="akey-opt ${selected === o ? 'sel' : ''}" data-q="${qIndex}" data-o="${o}">${OmrGenerator.optionLetter(o)}</div>
        `).join('')}
      </div>
      ${conf !== null ? `<div style="width:44px; flex-shrink:0;"><div class="confidence-bar"><div class="fill" style="width:${conf}%; background:${confColor};"></div></div></div>` : ''}
    </div>`;
}

async function handleAiProposeKey(testId) {
  const test = TestManager.getById(testId);
  if (!AIVision.isConfigured()) {
    openSheet(`
      <div class="section-title" style="margin-top:0;">AI Vision isn\u2019t set up yet</div>
      <div class="muted small mb-16">Add your Gemini API key in Settings to let AI read question papers and propose an answer key.</div>
      <button class="btn btn-primary btn-block" data-action="goto" data-href="#/settings">Open Settings</button>
    `);
    return;
  }
  if (!test.questionPaper) {
    promptForQuestionPaperImage(testId);
    return;
  }
  await runAiProposeKey(testId);
}

function promptForQuestionPaperImage(testId) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      TestManager.update(testId, { questionPaper: { type: 'image', dataUrl: reader.result } });
      await runAiProposeKey(testId);
    };
    reader.readAsDataURL(file);
  });
  input.click();
}

async function runAiProposeKey(testId) {
  const test = TestManager.getById(testId);
  const banner = document.getElementById('ai-banner');
  if (banner) { banner.style.display = 'flex'; banner.className = 'banner banner-ai mb-16'; banner.textContent = 'Reading the question paper…'; }

  const res = await QuestionParser.proposeAnswerKey(test.questionPaper ? test.questionPaper.dataUrl : null, test.numQuestions);
  const bannerEl = document.getElementById('ai-banner');
  if (!res.ok) {
    if (bannerEl) { bannerEl.className = 'banner banner-warn mb-16'; bannerEl.textContent = res.message; bannerEl.style.display = 'flex'; }
    return;
  }
  if (bannerEl) {
    bannerEl.className = 'banner banner-ai mb-16';
    let msg = 'AI proposed answers below — review and correct anything before approving.';
    if (res.detectedNumQuestions && res.detectedNumQuestions !== test.numQuestions) {
      msg += ` (AI counted ${res.detectedNumQuestions} questions on the page; this test is set to ${test.numQuestions} — settings unchanged.)`;
    }
    if (res.notes) msg += ' ' + res.notes;
    bannerEl.textContent = msg;
  }

  const draft = Forms.answerKeyDraft;
  res.proposedKey.forEach(a => {
    if (a.index < 0 || a.index >= draft.key.length) return;
    if (a.optionIndex !== null && a.optionIndex !== undefined) draft.key[a.index] = a.optionIndex;
    draft.meta[a.index] = { source: 'ai_inferred', confidence: a.confidence, reasoning: a.reasoning, questionText: a.questionText };
  });
  renderAnswerKey(testId);
}

function handleApproveKey(testId) {
  const draft = Forms.answerKeyDraft;
  if (!AnswerKeyService.canApprove(draft.key)) { toast('Finish setting every answer first'); return; }
  TestManager.setAnswerKey(testId, draft.key, true);
  TestManager.update(testId, { answerKeyMeta: draft.meta });
  Forms.answerKeyDraft = null;
  toast('Answer key approved');
  navigate(`#/test/${testId}`);
}

// ================================================================
// OMR SHEET (Custom OMR Creator preview + print/download)
// ================================================================
function renderOmrSheet(testId) {
  const test = TestManager.getById(testId);
  if (!test) { navigate('#/history'); return; }

  let template = test.omrTemplate;
  if (!template || template.numQuestions !== test.numQuestions || template.numOptions !== test.numOptions) {
    template = OmrGenerator.buildTemplate({
      testId: test.id, testName: test.name,
      numQuestions: test.numQuestions, numOptions: test.numOptions,
      rollNumberDigits: test.rollNumberDigits, includeStudentName: test.includeStudentName,
    });
    TestManager.setOmrTemplate(testId, template);
  }

  root().innerHTML = `
    ${bgBubbles()}
    ${topbar('OMR sheet')}
    <div class="screen" style="padding-top:4px;">
      <div class="banner banner-info mb-16">Optional: a ready-made sheet you can print. You don\u2019t need it — OMR Magic\u2019s AI can read any OMR sheet you already use. Just scan it.</div>
      <div class="omr-preview mb-16">
        <canvas id="omr-canvas"></canvas>
      </div>
      <div class="flex gap-12">
        <button class="btn btn-glass flex-1" data-action="download-omr" data-id="${test.id}">Download PNG</button>
        <button class="btn btn-primary flex-1" data-action="print-omr" data-id="${test.id}">Print</button>
      </div>
    </div>
  `;

  const canvas = document.getElementById('omr-canvas');
  OmrGenerator.renderToCanvas(template, canvas, 1);
}

function handleDownloadOmr(testId) {
  const test = TestManager.getById(testId);
  const canvas = document.createElement('canvas');
  OmrGenerator.renderToCanvas(test.omrTemplate, canvas, 2);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `${test.name.replace(/[^a-z0-9\-_]+/gi, '_')}_omr_sheet.png`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function handlePrintOmr(testId) {
  const test = TestManager.getById(testId);
  const canvas = document.createElement('canvas');
  OmrGenerator.renderToCanvas(test.omrTemplate, canvas, 2);
  const url = canvas.toDataURL('image/png');
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>${escapeHtml(test.name)}</title><style>body{margin:0;} img{width:100%;}</style></head><body><img src="${url}" onload="window.print()"></body></html>`);
  win.document.close();
}

// ================================================================
// SCAN — Magic Mode (camera -> processing -> live checking -> review -> save)
// Shared by single-sheet scanning and batch scanning.
// ================================================================
let scanCtx = null; // { test, mode, batchSession }

function renderScan(testId, mode) {
  const test = TestManager.getById(testId);
  if (!test || !TestManager.isReady(test)) { toast('Approve the answer key first'); navigate('#/history'); return; }
  scanCtx = { test, mode, batchSession: mode === 'batch' ? BatchScanner.createSession(testId, null) : null };
  if (!AIVision.isConfigured()) { showAiRequired(); return; }
  showCameraPhase();
}

// Sheets are read by AI (any layout), so scanning needs a Gemini key.
function showAiRequired() {
  const { test } = scanCtx;
  root().innerHTML = `
    ${bgBubbles()}
    ${topbar('Scan OMR', { noBack: false })}
    <div class="screen" style="padding-top:20px;">
      <div class="glass glass-panel text-center">
        <div style="font-size:38px;">✨</div>
        <div class="fw mt-8 mb-8" style="font-size:17px;">Turn on AI Vision to scan</div>
        <div class="muted small mb-16">OMR Magic uses Gemini to understand any OMR sheet — where the roll number, sections, question numbers and answers are — and to read the marks. Add your free Gemini API key once and you\u2019re set.</div>
        <button class="btn btn-primary btn-block" data-action="goto" data-href="#/settings">Open Settings</button>
        <button class="btn btn-ghost btn-block mt-8" data-action="goto" data-href="#/test/${test.id}">Back</button>
      </div>
    </div>
  `;
}

function showCameraPhase() {
  const { test, mode, batchSession } = scanCtx;
  root().innerHTML = `
    <div class="scanner-wrap">
      <div class="scanner-topbar">
        <div class="back-btn" id="scan-back">${iconChevronLeft()}</div>
        <div class="sc-title">${mode === 'batch' ? BatchScanner.progressLabel(batchSession) : test.name}</div>
      </div>
      <div class="scanner-video-box">
        <video id="scan-video" playsinline muted></video>
        <div class="scan-frame" id="scan-frame">
          <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        </div>
        <div class="scan-guidance" id="scan-guidance"><span class="dot"></span><span id="scan-guidance-text">Align the OMR inside the frame</span></div>
        <div class="scan-quality-tag hidden" id="scan-quality-tag"></div>
        <div id="no-camera-banner" class="hidden" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:30px; text-align:center; color:#fff; font-weight:600;">
          Camera access is unavailable. Choose an OMR photo instead.
        </div>
      </div>
      <div class="auto-toggle" id="auto-toggle">Auto capture: <span id="auto-toggle-state">On</span></div>
      <div class="scanner-controls">
        <div class="sc-side-btn" id="choose-photo-btn" aria-label="Choose photo">🖼️</div>
        <div class="shutter" id="shutter-btn" aria-label="Capture"></div>
        <div class="sc-side-btn" id="toggle-auto-btn" aria-label="Toggle auto capture">⚡</div>
      </div>
      <input type="file" id="file-input" accept="image/*" class="hidden">
    </div>
  `;

  const video = document.getElementById('scan-video');
  const frameEl = document.getElementById('scan-frame');
  const guidanceEl = document.getElementById('scan-guidance');
  const guidanceText = document.getElementById('scan-guidance-text');
  const qualityTag = document.getElementById('scan-quality-tag');
  let autoOn = true;

  CameraController.start(video, {
    autoCapture: true,
    onGuidanceUpdate(analysis) {
      guidanceText.textContent = analysis.message;
      guidanceEl.classList.toggle('ok', analysis.status === 'ready');
      frameEl.classList.toggle('detected', analysis.allFound && analysis.status !== 'ready');
      frameEl.classList.toggle('ready', analysis.status === 'ready');
      const rough = Math.round(Math.max(0, Math.min(100,
        (analysis.allFound ? 40 : 0) + Math.min(1, analysis.sharpness / 40) * 35 + Math.min(1, analysis.brightness / 180) * 25
      )));
      qualityTag.classList.remove('hidden');
      qualityTag.textContent = `Frame quality ${rough}%`;
    },
    onAutoCaptureReady() { triggerCapture(); },
  }).then(res => {
    if (!res.ok) {
      document.getElementById('no-camera-banner').classList.remove('hidden');
      guidanceEl.classList.add('hidden');
    }
  });

  setCleanup(() => CameraController.stop());

  document.getElementById('scan-back').addEventListener('click', () => {
    CameraController.stop();
    navigate(`#/test/${scanCtx.test.id}`);
  });
  document.getElementById('shutter-btn').addEventListener('click', triggerCapture);
  document.getElementById('toggle-auto-btn').addEventListener('click', () => {
    autoOn = !autoOn;
    CameraController.setAutoCapture(autoOn);
    document.getElementById('auto-toggle-state').textContent = autoOn ? 'On' : 'Off';
  });
  document.getElementById('choose-photo-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const canvas = await CameraController.loadImageFileToCanvas(file);
    CameraController.stop();
    processCapturedCanvas(canvas);
  });

  let capturing = false;
  async function triggerCapture() {
    if (capturing) return;
    capturing = true;
    guidanceText.textContent = 'Capturing…';
    const canvas = await CameraController.captureStill();
    CameraController.stop();
    if (!canvas) { toast('Couldn\u2019t capture — try again'); showCameraPhase(); return; }
    processCapturedCanvas(canvas);
  }
}

function showProcessingPhase() {
  root().innerHTML = `
    ${bgBubbles()}
    <div class="screen" style="padding-top:40px; align-items:center;">
      <div class="ai-pill" style="margin:0 auto;"><span class="dot"></span>Understanding sheet…</div>
      <div class="ai-processing-list" id="ai-steps" style="width:100%; max-width:340px; margin-left:auto; margin-right:auto;">
        <div class="ai-step active" id="step-layout"><div class="step-icon">1</div><div class="step-label">Understanding the sheet layout</div></div>
        <div class="ai-step" id="step-map"><div class="step-icon">2</div><div class="step-label">Finding roll no., sections &amp; answers</div></div>
        <div class="ai-step" id="step-marks"><div class="step-icon">3</div><div class="step-label">Double-checking marks (zoomed)</div></div>
        <div class="ai-step" id="step-check"><div class="step-icon">4</div><div class="step-label">Checking answers</div></div>
      </div>
      <div class="muted small text-center mt-16" id="ai-layout-summary" style="max-width:320px; margin-left:auto; margin-right:auto; min-height:20px;"></div>
      <div class="muted small text-center mt-8" style="max-width:320px; margin-left:auto; margin-right:auto;">This takes 10–40 seconds. Keep this screen open.</div>
    </div>
  `;
}

function advanceProcessingStep(stepId, state) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
  if (state === 'done') el.querySelector('.step-icon').textContent = '✓';
}

async function processCapturedCanvas(canvas) {
  showProcessingPhase();
  const { test } = scanCtx;
  const myScan = scanCtx;

  const res = await AIScanner.scanSheet(canvas, test, {
    onStage({ stage, detail }) {
      if (scanCtx !== myScan) return; // user navigated away
      if (stage === 'mapped') {
        advanceProcessingStep('step-layout', 'done');
        advanceProcessingStep('step-map', 'done');
        const el = document.getElementById('ai-layout-summary');
        if (el && detail) el.textContent = detail;
        advanceProcessingStep('step-marks', 'active');
      } else if (stage === 'verify') {
        advanceProcessingStep('step-marks', 'active');
      } else if (stage === 'grade') {
        advanceProcessingStep('step-marks', 'done');
        advanceProcessingStep('step-check', 'active');
      }
    },
  });
  if (scanCtx !== myScan) return;

  if (!res.success) { showScanError(res.message, res.reason); return; }
  advanceProcessingStep('step-check', 'done');
  setTimeout(() => { if (scanCtx === myScan) finishProcessing(res); }, 350);
}

function finishProcessing(res) {
  const { test } = scanCtx;
  scanCtx.rawResult = res;
  scanCtx.graded = GradingEngine.grade(res.detectedAnswers, test.answerKey, test.marking);
  scanCtx.identity = StudentManager.normalizeIdentity({
    name: res.studentName,
    rollNumber: res.rollNumberResult ? res.rollNumberResult.rollNumber : null,
    rollConfidence: res.rollNumberResult ? res.rollNumberResult.confidence : null,
  });
  if (res.quality.score < 50 || res.quality.warnings.length >= 2) showQualityGate(res.quality);
  else afterQualityAccepted();
}

function showScanError(message, reason) {
  const needsSettings = reason === 'not_configured';
  root().innerHTML = `
    <div class="scanner-wrap" style="align-items:center; justify-content:center; padding:30px;">
      <div class="glass glass-panel" style="background:rgba(255,255,255,0.9);">
        <div class="fw mb-8">Couldn\u2019t read that scan</div>
        <div class="muted small mb-16">${escapeHtml(message)}</div>
        ${needsSettings
          ? '<button class="btn btn-primary btn-block" data-action="goto" data-href="#/settings">Open Settings</button>'
          : '<button class="btn btn-primary btn-block" id="retry-scan">Try again</button>'}
        <button class="btn btn-ghost btn-block mt-8" id="cancel-scan">Cancel</button>
      </div>
    </div>
  `;
  const retry = document.getElementById('retry-scan');
  if (retry) retry.addEventListener('click', showCameraPhase);
  document.getElementById('cancel-scan').addEventListener('click', () => navigate(`#/test/${scanCtx.test.id}`));
}

function showQualityGate(quality) {
  root().innerHTML = `
    <div class="scanner-wrap" style="align-items:center; justify-content:center; padding:30px;">
      <div class="glass glass-panel" style="background:rgba(255,255,255,0.92);">
        <div class="fw mb-8">Reading confidence: ${quality.score}%</div>
        <div class="muted small mb-16">${quality.warnings.length ? escapeHtml(quality.warnings.join(' · ')) : 'This photo looks a little unreliable.'} Results may need extra review — a sharper, flatter photo usually fixes it.</div>
        <button class="btn btn-primary btn-block" id="retake-scan">Retake</button>
        <button class="btn btn-glass btn-block mt-8" id="continue-scan">Continue anyway</button>
      </div>
    </div>
  `;
  document.getElementById('retake-scan').addEventListener('click', showCameraPhase);
  document.getElementById('continue-scan').addEventListener('click', afterQualityAccepted);
}

function afterQualityAccepted() {
  const { test, rawResult, identity } = scanCtx;
  const dup = ResultManager.findPossibleDuplicate(test.id, rawResult.fingerprint, identity.rollNumber);
  if (dup) {
    root().innerHTML = `
      <div class="scanner-wrap" style="align-items:center; justify-content:center; padding:30px;">
        <div class="glass glass-panel" style="background:rgba(255,255,255,0.92);">
          <div class="fw mb-8">This sheet may already have been scanned</div>
          <div class="muted small mb-16">A result with a matching roll number or sheet already exists for this test.</div>
          <button class="btn btn-primary btn-block" id="view-existing">View existing</button>
          <button class="btn btn-glass btn-block mt-8" id="scan-anyway">Scan anyway</button>
        </div>
      </div>
    `;
    document.getElementById('view-existing').addEventListener('click', () => navigate(`#/result/${dup.id}`));
    document.getElementById('scan-anyway').addEventListener('click', showLiveChecking);
    return;
  }
  showLiveChecking();
}

function showLiveChecking() {
  const { test, graded } = scanCtx;
  root().innerHTML = `
    ${bgBubbles()}
    <div class="screen" style="padding-top:24px;">
      <div class="check-header">
        <div class="ch-title">Checking OMR...</div>
        <div class="check-progress">
          <div><div class="cp-pct" id="cp-pct">0%</div></div>
          <div class="cp-count" id="cp-count">0 / ${test.numQuestions} checked</div>
        </div>
      </div>
      <div class="qgrid" id="qgrid">
        ${graded.perQuestion.map(pq => `<div class="qcell pending" id="qcell-${pq.index}"><span class="qn">${pq.index + 1}</span><span class="qa"></span></div>`).join('')}
      </div>
    </div>
  `;

  const n = graded.perQuestion.length;
  const delay = Math.max(18, Math.min(90, Math.floor(1400 / n)));
  let i = 0;
  let runningCorrect = 0, runningChecked = 0;

  const timer = setInterval(() => {
    if (i >= n) { clearInterval(timer); setTimeout(afterLiveChecking, 450); return; }
    const pq = graded.perQuestion[i];
    const cell = document.getElementById(`qcell-${pq.index}`);
    cell.classList.remove('pending');
    const label = pq.detected !== null && pq.detected !== undefined ? OmrGenerator.optionLetter(pq.detected) : (pq.status === 'multiple' ? '!' : '?');
    let mark = '';
    if (pq.outcome === 'correct') { cell.classList.add('correct'); mark = '✓'; runningCorrect++; }
    else if (pq.outcome === 'wrong' || pq.outcome === 'invalid') { cell.classList.add('wrong'); mark = '✕'; }
    else if (pq.outcome === 'unclear') { cell.classList.add('unclear'); mark = '?'; }
    else { cell.classList.add('unclear'); mark = '○'; }
    cell.querySelector('.qa').textContent = pq.status === 'unclear' ? '?' : label;
    runningChecked++;
    document.getElementById('cp-count').textContent = `${runningChecked} / ${n} checked`;
    document.getElementById('cp-pct').textContent = `${Math.round((runningCorrect / runningChecked) * 100)}%`;
    i++;
  }, delay);
}

function afterLiveChecking() {
  const { graded } = scanCtx;
  const flagged = graded.perQuestion.filter(pq => pq.outcome === 'unclear' || pq.outcome === 'invalid');
  if (flagged.length) showReviewQueue(flagged);
  else finalizeScan();
}

function showReviewQueue(flagged) {
  const { test } = scanCtx;
  root().innerHTML = `
    ${bgBubbles()}
    ${topbar('Review needed', { noBack: true })}
    <div class="screen" style="padding-top:4px;">
      <div class="banner banner-review mb-16">${flagged.length} question${flagged.length === 1 ? '' : 's'} need your attention</div>
      <div id="review-list">
        ${flagged.map(pq => reviewCardHtml(pq, test)).join('')}
      </div>
    </div>
  `;
  wireReviewCards();
}

function reviewCardHtml(pq, test) {
  const reasons = {
    disagree: 'The two AI readings disagree',
    low: 'Faint or unclear mark',
    range: 'Marked option is outside this test\u2019s options',
    missing: 'AI couldn\u2019t see this row clearly',
  };
  const reason = pq.outcome === 'invalid' ? 'More than one bubble is marked' : (reasons[pq.reason] || 'Unclear');
  const hasSuggestion = pq.suggested !== null && pq.suggested !== undefined && pq.suggested < test.numOptions;
  const acceptBtn = hasSuggestion
    ? `<button class="btn btn-sm btn-primary" data-rc-action="accept" data-sug="${pq.suggested}">AI suggests ${OmrGenerator.optionLetter(pq.suggested)} — accept</button>`
    : '';
  const unansweredCls = pq.suggestedBlank ? 'btn-primary' : 'btn-glass';
  return `
    <div class="review-card" id="rc-${pq.index}" data-q="${pq.index}">
      <div class="rc-q">Question ${pq.index + 1}</div>
      <div class="rc-reason">${reason}</div>
      <div class="review-actions">
        ${acceptBtn}
        <button class="btn btn-sm ${unansweredCls}" data-rc-action="unanswered">${pq.suggestedBlank ? 'Looks blank — mark unanswered' : 'Mark unanswered'}</button>
        <button class="btn btn-sm btn-glass" data-rc-action="change">Change answer</button>
        <button class="btn btn-sm btn-glass" data-rc-action="review-image">Review image</button>
      </div>
    </div>`;
}

function wireReviewCards() {
  document.querySelectorAll('.review-card').forEach(card => {
    const qi = parseInt(card.getAttribute('data-q'), 10);
    card.querySelectorAll('[data-rc-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-rc-action');
        if (action === 'unanswered') resolveReviewQuestion(qi, null);
        else if (action === 'accept') resolveReviewQuestion(qi, parseInt(btn.getAttribute('data-sug'), 10));
        else if (action === 'change') openChangeAnswerSheet(qi);
        else if (action === 'review-image') openImageReview(qi);
      });
    });
  });
}

function openChangeAnswerSheet(qIndex) {
  const { test } = scanCtx;
  openSheet(`
    <div class="section-title" style="margin-top:0;">Question ${qIndex + 1}</div>
    <div class="option-pills mb-16">
      ${Array.from({ length: test.numOptions }).map((_, o) => `<div class="pill" data-choose-opt="${o}">${OmrGenerator.optionLetter(o)}</div>`).join('')}
    </div>
  `);
  document.querySelectorAll('[data-choose-opt]').forEach(p => {
    p.addEventListener('click', () => {
      const opt = parseInt(p.getAttribute('data-choose-opt'), 10);
      closeSheet();
      resolveReviewQuestion(qIndex, opt);
    });
  });
}

function openImageReview(qIndex) {
  const { rawResult } = scanCtx;
  const crop = (rawResult.blockCrops || []).find(c => qIndex + 1 >= c.first && qIndex + 1 <= c.last);
  openSheet(`
    <div class="section-title" style="margin-top:0;">${crop ? `Question ${qIndex + 1} — zoomed block` : 'Scanned sheet'}</div>
    <img src="${crop ? crop.dataUrl : rawResult.previewDataUrl}" style="width:100%; border-radius:14px;">
  `);
}

function resolveReviewQuestion(qIndex, newOption) {
  const { test, graded } = scanCtx;
  GradingEngine.regradeQuestion(graded, qIndex, newOption, test.marking, test.answerKey);
  const card = document.getElementById(`rc-${qIndex}`);
  if (card) card.remove();
  const remaining = document.querySelectorAll('.review-card').length;
  if (remaining === 0) finalizeScan();
}

function finalizeScan() {
  const { test, graded, identity, rawResult, mode, batchSession } = scanCtx;
  const result = ResultManager.saveResult({
    testId: test.id, identity, graded,
    scanQuality: rawResult.quality, sheetFingerprint: rawResult.fingerprint,
    imageThumb: rawResult.previewDataUrl,
  });

  if (mode === 'batch') {
    BatchScanner.recordSheet(batchSession, result);
    toast(`Sheet ${batchSession.completed.length} ✓`);
    setTimeout(() => { scanCtx = { test, mode, batchSession }; showCameraPhase(); }, 700);
  } else {
    navigate(`#/result/${result.id}`);
  }
}

// ================================================================
// RESULT
// ================================================================
function renderResult(resultId) {
  const result = ResultManager.getById(resultId);
  if (!result) { navigate('#/history'); return; }
  const test = TestManager.getById(result.testId);
  const g = result.graded;
  const circumference = 2 * Math.PI * 82;
  const offset = circumference * (1 - Math.min(1, Math.max(0, g.percentage / 100)));

  root().innerHTML = `
    ${bgBubbles()}
    ${topbar(test ? test.name : 'Result', { right: `<div class="back-btn" data-action="result-menu" data-id="${result.id}">⋯</div>` })}
    <div class="screen" style="padding-top:4px;">
      <div class="glass glass-panel mb-16 text-center">
        <div class="flex" style="justify-content:center; align-items:center; gap:8px; cursor:pointer;" data-action="edit-identity" data-id="${result.id}">
          <span class="fw" style="font-size:16px;">${escapeHtml(result.identity.name || (result.identity.rollNumber ? 'Roll No. ' + result.identity.rollNumber : 'Unnamed student'))}</span>
          <span class="muted small">✏️</span>
        </div>
        ${result.identity.rollNumber && result.identity.name ? `<div class="muted small mt-8">Roll No. ${escapeHtml(result.identity.rollNumber)}</div>` : ''}
        ${result.identity.rollConfidence !== null && result.identity.rollConfidence < 0.6 ? `<div class="badge badge-amber mt-8">Roll number uncertain — please confirm</div>` : ''}
      </div>

      <div class="result-hero">
        <div class="score-ring-wrap">
          <svg width="190" height="190" viewBox="0 0 190 190">
            <circle cx="95" cy="95" r="82" fill="none" stroke="#E3EEFA" stroke-width="14"/>
            <circle cx="95" cy="95" r="82" fill="none" stroke="url(#grad)" stroke-width="14" stroke-linecap="round"
              stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" id="score-circle"
              style="transition:stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1);"/>
            <defs><linearGradient id="grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5FD6D0"/><stop offset="100%" stop-color="#2E74D6"/></linearGradient></defs>
          </svg>
          <div class="score-center">
            <div class="sc-frac">${g.score}/${g.maxScore}</div>
            <div class="sc-pct">${g.percentage}%</div>
          </div>
        </div>
      </div>

      <div class="stat-grid mb-16">
        <div class="sg-item"><div class="sg-num" style="color:#1E8F68;">✓ ${g.correct}</div><div class="sg-label">CORRECT</div></div>
        <div class="sg-item"><div class="sg-num" style="color:#C15530;">✕ ${g.wrong}</div><div class="sg-label">WRONG</div></div>
        <div class="sg-item"><div class="sg-num">○ ${g.unanswered}</div><div class="sg-label">UNANSWERED</div></div>
        <div class="sg-item"><div class="sg-num" style="color:#9A7A1A;">? ${g.unclear}</div><div class="sg-label">UNCLEAR</div></div>
      </div>

      ${result.scanQuality ? `<div class="muted small mb-16 text-center">Read by AI · confidence ${result.scanQuality.score}%${result.scanQuality.verified ? ' · double-checked' : ''}${result.scanQuality.summary ? '<br>' + escapeHtml(result.scanQuality.summary) : ''}${(result.scanQuality.notes || []).map(n => '<br>' + escapeHtml(n)).join('')}</div>` : ''}

      <div class="section-title">Question review</div>
      <div class="glass glass-panel">
        ${g.perQuestion.map(pq => questionReviewRow(pq)).join('')}
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const circle = document.getElementById('score-circle');
    if (circle) circle.style.strokeDashoffset = String(offset);
  });

  document.querySelectorAll('.qreview-row').forEach(row => {
    row.addEventListener('click', () => openEditResultAnswer(result.id, parseInt(row.getAttribute('data-q'), 10)));
  });
  document.querySelectorAll('[data-explain-q]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runExplainAnswer(result.id, parseInt(btn.getAttribute('data-explain-q'), 10), btn);
    });
  });
}

async function runExplainAnswer(resultId, qIndex, btnEl) {
  const result = ResultManager.getById(resultId);
  const test = TestManager.getById(result.testId);
  const container = document.getElementById(`explain-${qIndex}`);
  if (!AIVision.isConfigured()) {
    container.innerHTML = `<div class="explain-box">Add your Gemini API key in Settings to enable explanations.</div>`;
    return;
  }
  btnEl.textContent = '…';
  const pq = result.graded.perQuestion[qIndex];
  const meta = (test.answerKeyMeta && test.answerKeyMeta[qIndex]) || null;
  const res = await AIVision.explainAnswer({
    questionNumber: qIndex + 1,
    questionText: meta ? meta.questionText : null,
    options: null,
    studentAnswerLabel: pq.detected !== null && pq.detected !== undefined ? OmrGenerator.optionLetter(pq.detected) : 'no answer',
    correctAnswerLabel: pq.correctOption !== null && pq.correctOption !== undefined ? OmrGenerator.optionLetter(pq.correctOption) : 'unknown',
  });
  btnEl.textContent = 'Explain';
  if (!res.ok) { container.innerHTML = `<div class="explain-box">${escapeHtml(res.message)}</div>`; return; }
  container.innerHTML = `<div class="explain-box">${escapeHtml(res.explanation)}</div>`;
}

function questionReviewRow(pq) {
  const tag = pq.outcome === 'correct' ? '✓' : (pq.outcome === 'wrong' || pq.outcome === 'invalid') ? '✕' : pq.outcome === 'unclear' ? '?' : '○';
  const color = pq.outcome === 'correct' ? 'var(--mint)' : (pq.outcome === 'wrong' || pq.outcome === 'invalid') ? 'var(--coral)' : pq.outcome === 'unclear' ? 'var(--banana)' : 'var(--ink-faint)';
  const ansLabel = (pq.detected !== null && pq.detected !== undefined) ? OmrGenerator.optionLetter(pq.detected) : '—';
  const correctLabel = (pq.correctOption !== null && pq.correctOption !== undefined) ? OmrGenerator.optionLetter(pq.correctOption) : '—';
  const isWrong = pq.outcome === 'wrong' || pq.outcome === 'invalid';
  return `
    <div class="qreview-row ${pq.corrected ? 'edited' : ''}" data-q="${pq.index}">
      <div class="qr-num">Q${pq.index + 1}</div>
      <div class="qr-ans" style="color:${color};">${ansLabel}</div>
      <span class="qr-tag" style="color:${color};">${tag}</span>
      ${isWrong ? `<div class="qr-correct">Correct: ${correctLabel}</div>` : ''}
      ${isWrong ? `<button class="explain-btn" data-explain-q="${pq.index}">Explain</button>` : ''}
    </div>
    <div id="explain-${pq.index}"></div>`;
}

function openEditResultAnswer(resultId, qIndex) {
  const result = ResultManager.getById(resultId);
  const test = TestManager.getById(result.testId);
  openSheet(`
    <div class="section-title" style="margin-top:0;">Question ${qIndex + 1}</div>
    <div class="option-pills mb-8">
      ${Array.from({ length: test.numOptions }).map((_, o) => `<div class="pill" data-choose-opt="${o}">${OmrGenerator.optionLetter(o)}</div>`).join('')}
    </div>
    <div class="list-item" data-choose-opt="null" style="margin-top:8px;"><div class="li-main"><div class="li-title">Mark unanswered</div></div></div>
  `);
  document.querySelectorAll('[data-choose-opt]').forEach(p => {
    p.addEventListener('click', () => {
      const raw = p.getAttribute('data-choose-opt');
      const opt = raw === 'null' ? null : parseInt(raw, 10);
      closeSheet();
      GradingEngine.regradeQuestion(result.graded, qIndex, opt, test.marking, test.answerKey);
      ResultManager.updateResult(resultId, { graded: result.graded });
      renderResult(resultId);
    });
  });
}

function openEditIdentity(resultId) {
  const result = ResultManager.getById(resultId);
  openSheet(`
    <div class="section-title" style="margin-top:0;">Student</div>
    <div class="field"><label>Name</label><input type="text" id="edit-name" value="${escapeHtml(result.identity.name || '')}" placeholder="Type the student's name"></div>
    <div class="field"><label>Roll number</label><input type="text" id="edit-roll" value="${escapeHtml(result.identity.rollNumber || '')}" placeholder="Roll number"></div>
    <button class="btn btn-primary btn-block" id="save-identity">Save</button>
  `);
  document.getElementById('save-identity').addEventListener('click', () => {
    const name = document.getElementById('edit-name').value.trim();
    const roll = document.getElementById('edit-roll').value.trim();
    result.identity.name = name || null;
    result.identity.rollNumber = roll || null;
    result.identity.identityConfirmed = true;
    ResultManager.updateResult(resultId, { identity: result.identity });
    closeSheet();
    renderResult(resultId);
  });
}

function openResultMenu(resultId) {
  openSheet(`
    <div class="list">
      <div class="list-item" data-action="delete-result" data-id="${resultId}"><div class="li-icon">🗑️</div><div class="li-main"><div class="li-title" style="color:var(--danger);">Delete this result</div></div></div>
    </div>
  `);
}

// ================================================================
// SETTINGS / PRIVACY
// ================================================================
function renderSettings() {
  const tests = TestManager.getAll();
  const usageKb = Math.round(Storage.estimateUsageBytes() / 1024);
  const aiCfg = AIVision.getConfig();
  root().innerHTML = `
    ${bgBubbles()}
    ${topbar('Settings & privacy')}
    <div class="screen" style="padding-top:4px;">
      <div class="banner banner-info mb-16">Your tests, answer keys and results are stored only on this device. Photos are sent to Google\u2019s Gemini API (using your own key) only when you scan a sheet or use AI features.</div>

      <div class="section-title">AI Vision</div>
      <div class="glass glass-panel mb-16">
        <div class="toggle-row">
          <div><div class="tr-label">Enable AI Vision</div><div class="tr-sub">Required for scanning: reads any OMR sheet, question papers and more</div></div>
          <div class="switch ${aiCfg.enabled ? 'on' : ''}" id="sw-ai-enabled"></div>
        </div>
        <div class="toggle-row mt-12">
          <div><div class="tr-label">Double-check scans</div><div class="tr-sub">Re-reads every block zoomed in. More accurate; uses ~5 requests per sheet</div></div>
          <div class="switch ${aiCfg.verifyScans !== false ? 'on' : ''}" id="sw-ai-verify"></div>
        </div>
        <div class="field mt-12">
          <label>Gemini API key</label>
          <input type="password" id="ai-key-input" placeholder="AIza..." value="${escapeHtml(aiCfg.apiKey || '')}" autocomplete="off">
        </div>
        <div class="field">
          <label>Model</label>
          <select id="ai-model-select">
            <option value="gemini-3.8-flash" ${aiCfg.model === 'gemini-3.8-flash' ? 'selected' : ''}>Gemini 3.8 Flash (recommended)</option>
            <option value="gemini-3.5-flash-lite" ${aiCfg.model === 'gemini-3.5-flash-lite' ? 'selected' : ''}>Gemini 3.5 Flash-Lite (fastest, cheapest)</option>
            <option value="gemini-2.5-flash" ${aiCfg.model === 'gemini-2.5-flash' ? 'selected' : ''}>Gemini 2.5 Flash</option>
            <option value="gemini-3.1-pro-preview" ${aiCfg.model === 'gemini-3.1-pro-preview' ? 'selected' : ''}>Gemini 3.1 Pro (most accurate, slower)</option>
          </select>
        </div>
        <div class="muted small mb-12">Your key is stored only in this browser\u2019s local storage and is sent directly to Google\u2019s Gemini API \u2014 never bundled in the app, never sent anywhere else. Get a free key at aistudio.google.com/apikey. Since this is a static site with no backend, anyone with access to this device/browser could read the key from local storage; use a key with a low spending limit.</div>
        <div class="flex gap-12">
          <button class="btn btn-glass flex-1" id="save-ai-config">Save</button>
          <button class="btn btn-primary flex-1" id="test-ai-connection">Test connection</button>
        </div>
        <div id="ai-test-result" class="muted small mt-12"></div>
      </div>

      <div class="section-title">Storage</div>
      <div class="glass glass-panel mb-16">
        <div class="flex" style="justify-content:space-between;"><span class="muted small">Tests saved</span><span class="fw small">${tests.length}</span></div>
        <div class="flex mt-8" style="justify-content:space-between;"><span class="muted small">Local data used</span><span class="fw small">${usageKb} KB</span></div>
      </div>

      <div class="section-title">Danger zone</div>
      <div class="list">
        <div class="list-item" data-action="clear-all-data"><div class="li-icon">🗑️</div><div class="li-main"><div class="li-title" style="color:var(--danger);">Delete all local data</div><div class="li-sub">Removes every test, key, and result from this device</div></div></div>
      </div>

      <div class="section-title">About</div>
      <div class="glass glass-panel">
        <div class="muted small">OMR Magic uses Gemini AI to understand the layout of any OMR sheet (roll number, sections, question numbers, options) and to read the marks, then grades them against your answer key on this device. Sheet photos are sent to Google\u2019s Gemini API only while scanning; your tests, results and key stay on this device.</div>
      </div>
    </div>
  `;

  let pendingEnabled = aiCfg.enabled;
  let pendingVerify = aiCfg.verifyScans !== false;
  document.getElementById('sw-ai-enabled').addEventListener('click', (e) => {
    pendingEnabled = !pendingEnabled;
    e.target.classList.toggle('on', pendingEnabled);
  });
  document.getElementById('sw-ai-verify').addEventListener('click', (e) => {
    pendingVerify = !pendingVerify;
    e.target.classList.toggle('on', pendingVerify);
  });
  document.getElementById('save-ai-config').addEventListener('click', () => {
    const apiKey = document.getElementById('ai-key-input').value.trim();
    const model = document.getElementById('ai-model-select').value;
    AIVision.setConfig({ apiKey, model, enabled: pendingEnabled, verifyScans: pendingVerify });
    toast('AI settings saved');
  });
  document.getElementById('test-ai-connection').addEventListener('click', async () => {
    const apiKey = document.getElementById('ai-key-input').value.trim();
    const model = document.getElementById('ai-model-select').value;
    AIVision.setConfig({ apiKey, model, enabled: true, verifyScans: pendingVerify });
    document.getElementById('sw-ai-enabled').classList.add('on');
    pendingEnabled = true;
    const resultEl = document.getElementById('ai-test-result');
    resultEl.textContent = 'Testing…';
    const res = await AIVision.testConnection();
    resultEl.textContent = res.message;
    resultEl.style.color = res.ok ? 'var(--success)' : 'var(--danger)';
  });
}

function handleClearAllData() {
  openSheet(`
    <div class="section-title" style="margin-top:0;">Delete all local data?</div>
    <div class="muted small mb-16">This removes every test, answer key, OMR sheet, and student result stored on this device. This cannot be undone.</div>
    <button class="btn btn-danger btn-block" id="confirm-clear-all">Delete everything</button>
    <button class="btn btn-ghost btn-block mt-8" id="cancel-clear-all">Cancel</button>
  `);
  document.getElementById('confirm-clear-all').addEventListener('click', () => {
    Storage.clearEverything();
    closeSheet();
    toast('All local data deleted');
    navigate('#/home');
  });
  document.getElementById('cancel-clear-all').addEventListener('click', closeSheet);
}

// ================================================================
// TEST ACTIONS (rename / duplicate / delete)
// ================================================================
function openRenameTest(testId) {
  const test = TestManager.getById(testId);
  openSheet(`
    <div class="section-title" style="margin-top:0;">Rename test</div>
    <div class="field"><input type="text" id="rename-input" value="${escapeHtml(test.name)}"></div>
    <button class="btn btn-primary btn-block" id="save-rename">Save</button>
  `);
  document.getElementById('save-rename').addEventListener('click', () => {
    const val = document.getElementById('rename-input').value.trim();
    if (val) TestManager.update(testId, { name: val });
    closeSheet();
    renderRoute();
  });
}

function handleDuplicateTest(testId) {
  const copy = TestManager.duplicate(testId);
  closeSheet();
  toast('Test duplicated');
  if (copy) navigate(`#/test/${copy.id}`);
}

function confirmDeleteTest(testId) {
  const test = TestManager.getById(testId);
  openSheet(`
    <div class="section-title" style="margin-top:0;">Delete "${escapeHtml(test.name)}"?</div>
    <div class="muted small mb-16">This also deletes every scanned result for this test. This cannot be undone.</div>
    <button class="btn btn-danger btn-block" id="confirm-delete-test">Delete test</button>
    <button class="btn btn-ghost btn-block mt-8" id="cancel-delete-test">Cancel</button>
  `);
  document.getElementById('confirm-delete-test').addEventListener('click', () => {
    TestManager.remove(testId);
    closeSheet();
    toast('Test deleted');
    navigate('#/history');
  });
  document.getElementById('cancel-delete-test').addEventListener('click', closeSheet);
}

function confirmDeleteResult(resultId) {
  const result = ResultManager.getById(resultId);
  openSheet(`
    <div class="section-title" style="margin-top:0;">Delete this result?</div>
    <div class="muted small mb-16">This cannot be undone.</div>
    <button class="btn btn-danger btn-block" id="confirm-delete-result">Delete</button>
    <button class="btn btn-ghost btn-block mt-8" id="cancel-delete-result">Cancel</button>
  `);
  document.getElementById('confirm-delete-result').addEventListener('click', () => {
    const testId = result.testId;
    ResultManager.remove(resultId);
    closeSheet();
    toast('Result deleted');
    navigate(`#/test/${testId}`);
  });
  document.getElementById('cancel-delete-result').addEventListener('click', closeSheet);
}

// ================================================================
// GLOBAL CLICK DELEGATION
// ================================================================
function initGlobalDelegation() {
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    const id = el.getAttribute('data-id');
    const href = el.getAttribute('data-href');

    switch (action) {
      case 'back': history.back(); break;
      case 'goto': navigate(href); break;
      case 'start-test': handleStartTest(); break;
      case 'quick-scan': handleQuickScan(); break;
      case 'test-menu': openTestMenu(id); break;
      case 'need-key': toast('Approve the answer key first'); navigate(`#/answer-key/${id}`); break;
      case 'duplicate-test': handleDuplicateTest(id); break;
      case 'rename-test': closeSheet(); openRenameTest(id); break;
      case 'delete-test': closeSheet(); confirmDeleteTest(id); break;
      case 'export-csv': {
        const test = TestManager.getById(id);
        const results = ResultManager.getByTest(id);
        if (!results.length) { toast('No results to export yet'); break; }
        ExportService.exportCSV(test, results);
        break;
      }
      case 'save-create-test': handleSaveCreateTest(); break;
      case 'ai-propose-key': handleAiProposeKey(id); break;
      case 'approve-key': handleApproveKey(id); break;
      case 'download-omr': handleDownloadOmr(id); break;
      case 'print-omr': handlePrintOmr(id); break;
      case 'result-menu': openResultMenu(id); break;
      case 'delete-result': closeSheet(); confirmDeleteResult(id); break;
      case 'clear-all-data': handleClearAllData(); break;
      case 'edit-identity': openEditIdentity(id); break;
      default: break;
    }
  });
}
