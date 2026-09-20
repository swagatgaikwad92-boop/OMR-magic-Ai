/* ============================================================
   exportService.js — clean, swappable export interfaces.
   CSV is fully implemented (no dependency needed, works offline
   on GitHub Pages). Excel/PDF export are defined as the same
   shape of interface so a real library (e.g. SheetJS, pdf-lib)
   can be dropped in later without touching calling code.
   ============================================================ */

const ExportService = (() => {
  function resultsToRows(test, results) {
    const header = ['Name', 'Roll Number', 'Score', 'Max Score', 'Percentage', 'Correct', 'Wrong', 'Unanswered', 'Unclear', 'Scanned At'];
    const rows = results.map(r => [
      r.identity.name || '',
      r.identity.rollNumber || '',
      r.graded.score,
      r.graded.maxScore,
      r.graded.percentage,
      r.graded.correct,
      r.graded.wrong,
      r.graded.unanswered,
      r.graded.unclear,
      new Date(r.scannedAt).toLocaleString(),
    ]);
    return [header, ...rows];
  }

  function exportCSV(test, results) {
    const rows = resultsToRows(test, results);
    const csv = rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, sanitizeFilename(test.name) + '_results.csv');
    return { ok: true };
  }

  function escapeCsvCell(cell) {
    const s = String(cell ?? '');
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportExcel(/* test, results */) {
    // Interface reserved for a real XLSX writer (e.g. SheetJS). Not bundled
    // in this build to keep the app dependency-free and GitHub-Pages-simple.
    return { ok: false, reason: 'not_available', message: 'Excel export isn\u2019t included in this build yet — use CSV, which opens in Excel too.' };
  }

  function exportPDF(/* test, results */) {
    // Interface reserved for a real PDF writer. Not bundled in this build.
    return { ok: false, reason: 'not_available', message: 'PDF export isn\u2019t included in this build yet — use CSV for now.' };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function sanitizeFilename(name) {
    return (name || 'omr-magic').replace(/[^a-z0-9\-_]+/gi, '_');
  }

  return { exportCSV, exportExcel, exportPDF };
})();
