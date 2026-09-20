/* ============================================================
   omrGenerator.js — Custom OMR Creator.
   Builds an exact geometric template (every fiducial marker and
   every bubble's reference-space coordinate) and renders it to a
   printable canvas. The SAME template is later used by
   omrScanner.js to know exactly where to look on a scanned photo —
   that's what makes real bubble reading possible without a
   generic (and unreliable) grid-guessing algorithm.

   Reference space: a fixed virtual page, 1000 x 1414 units
   (A4 proportions), regardless of final render/print resolution.
   ============================================================ */

const OmrGenerator = (() => {
  const PAGE_W = 1000, PAGE_H = 1414;
  const MARGIN = 56;
  const FIDUCIAL_SIZE = 40;

  function buildTemplate({ testId, testName, numQuestions, numOptions, rollNumberDigits, includeStudentName }) {
    const fiducials = [
      { id: 'tl', x: MARGIN, y: MARGIN },
      { id: 'tr', x: PAGE_W - MARGIN - FIDUCIAL_SIZE, y: MARGIN },
      { id: 'bl', x: MARGIN, y: PAGE_H - MARGIN - FIDUCIAL_SIZE },
      { id: 'br', x: PAGE_W - MARGIN - FIDUCIAL_SIZE, y: PAGE_H - MARGIN - FIDUCIAL_SIZE },
    ].map(f => ({ ...f, cx: f.x + FIDUCIAL_SIZE / 2, cy: f.y + FIDUCIAL_SIZE / 2 }));

    const contentLeft = MARGIN + FIDUCIAL_SIZE + 26;
    const contentRight = PAGE_W - MARGIN - FIDUCIAL_SIZE - 26;
    const contentTop = MARGIN + FIDUCIAL_SIZE + 40;

    let cursorY = contentTop + 70; // room for title

    // ---- student identity block ----
    const studentBlock = { y: cursorY, height: 0 };
    let rollNumber = null;
    if (includeStudentName) {
      studentBlock.nameLine = { x: contentLeft, y: cursorY + 26, w: (contentRight - contentLeft) * 0.62 };
    }
    if (rollNumberDigits > 0) {
      const digitW = 34, digitGap = 8, bubbleR = 12, bubbleGapY = 26;
      const rollX = contentLeft + (contentRight - contentLeft) * 0.68;
      const columns = [];
      for (let d = 0; d < rollNumberDigits; d++) {
        const colX = rollX + d * (digitW + digitGap);
        const bubbles = [];
        for (let v = 0; v <= 9; v++) {
          bubbles.push({ value: v, x: colX, y: cursorY + 54 + v * bubbleGapY });
        }
        columns.push({ x: colX, bubbles });
      }
      rollNumber = { x: rollX, y: cursorY, digits: rollNumberDigits, columns, bubbleR };
      studentBlock.height = 54 + 10 * 26 + 20;
    } else {
      studentBlock.height = 60;
    }
    cursorY += studentBlock.height + 30;

    // ---- question grid ----
    // choose column count so everything fits on one page
    const rowH = 34;
    const availableH = PAGE_H - MARGIN - FIDUCIAL_SIZE - 40 - cursorY;
    const maxRowsPerColumn = Math.max(6, Math.floor(availableH / rowH));
    const numCols = Math.max(1, Math.ceil(numQuestions / maxRowsPerColumn));
    const rowsPerColumn = Math.ceil(numQuestions / numCols);
    const colWidth = (contentRight - contentLeft) / numCols;
    const bubbleR = Math.min(11, Math.max(7, Math.floor((colWidth - 60) / (numOptions * 3.4))));
    const optionGap = bubbleR * 2.6;

    const questions = [];
    for (let q = 0; q < numQuestions; q++) {
      const col = Math.floor(q / rowsPerColumn);
      const rowInCol = q % rowsPerColumn;
      const qx = contentLeft + col * colWidth;
      const qy = cursorY + rowInCol * rowH;
      const optionsStartX = qx + 46;
      const options = [];
      for (let o = 0; o < numOptions; o++) {
        options.push({ x: optionsStartX + o * optionGap, y: qy });
      }
      questions.push({ index: q, labelX: qx, labelY: qy, options });
    }

    return {
      version: 1,
      testId, testName,
      pageWidth: PAGE_W, pageHeight: PAGE_H,
      fiducialSize: FIDUCIAL_SIZE,
      fiducials,
      studentBlock: includeStudentName ? studentBlock : null,
      rollNumber,
      numQuestions, numOptions,
      bubbleRadius: bubbleR,
      questions,
      generatedAt: new Date().toISOString(),
    };
  }

  function optionLetter(i) { return String.fromCharCode(65 + i); }

  function renderToCanvas(template, canvas, scale = 1) {
    canvas.width = template.pageWidth * scale;
    canvas.height = template.pageHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, template.pageWidth, template.pageHeight);
    ctx.fillStyle = '#0A2036';
    ctx.strokeStyle = '#0A2036';

    // fiducials
    template.fiducials.forEach(f => {
      ctx.fillRect(f.x, f.y, template.fiducialSize, template.fiducialSize);
    });

    // header
    ctx.font = '700 26px Arial';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(template.testName || 'Test', template.fiducials[0].x + template.fiducialSize + 26, template.fiducials[0].y + 24);
    ctx.font = '400 13px Arial';
    ctx.fillStyle = '#66788C';
    ctx.fillText('Scan with OMR Magic \u2022 Do not fold or staple through the corner markers', template.fiducials[0].x + template.fiducialSize + 26, template.fiducials[0].y + 44);
    ctx.fillStyle = '#0A2036';

    // student block
    if (template.studentBlock) {
      const sb = template.studentBlock;
      if (sb.nameLine) {
        ctx.font = '600 12px Arial';
        ctx.fillText('Student Name', sb.nameLine.x, sb.nameLine.y - 8);
        ctx.beginPath();
        ctx.moveTo(sb.nameLine.x, sb.nameLine.y + 6);
        ctx.lineTo(sb.nameLine.x + sb.nameLine.w, sb.nameLine.y + 6);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    // roll number bubbles
    if (template.rollNumber) {
      const rn = template.rollNumber;
      ctx.font = '600 12px Arial';
      ctx.fillText('Roll Number', rn.x, rn.y - 8);
      rn.columns.forEach(col => {
        col.bubbles.forEach(b => {
          drawBubble(ctx, b.x, b.y, rn.bubbleR, String(b.value));
        });
      });
    }

    // questions
    ctx.font = '700 13px Arial';
    template.questions.forEach(q => {
      ctx.fillStyle = '#0A2036';
      ctx.font = '700 13px Arial';
      ctx.fillText(String(q.index + 1), q.labelX, q.labelY + 5);
      q.options.forEach((o, oi) => {
        drawBubble(ctx, o.x, o.y, template.bubbleRadius, optionLetter(oi));
      });
    });

    ctx.restore();
  }

  function drawBubble(ctx, x, y, r, label) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#3A4E62';
    ctx.stroke();
    ctx.fillStyle = '#3A4E62';
    ctx.font = `${Math.round(r * 1.05)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0A2036';
  }

  return { buildTemplate, renderToCanvas, optionLetter, PAGE_W, PAGE_H };
})();
