/* ============================================================
   camera.js — camera lifecycle + live guidance loop.
   Keeps getUserMedia plumbing and the auto-capture stability
   timer separate from both the CV engine and the screen/UI code.
   ============================================================ */

const CameraController = (() => {
  let stream = null;
  let videoEl = null;
  let guidanceTimer = null;
  let readyStreak = 0;
  let onGuidance = null;
  let onAutoCapture = null;
  let autoCaptureEnabled = true;
  let autoCaptured = false;

  let prevBox = null;  // previous tick's page box, for the "hold steady" check
  const GUIDANCE_INTERVAL_MS = 260;
  const READY_STREAK_NEEDED = 3; // ~780ms of stable "ready" before auto-capture
  let generation = 0;

  async function start(videoElement, { onGuidanceUpdate, onAutoCaptureReady, autoCapture = true }) {
    videoEl = videoElement;
    onGuidance = onGuidanceUpdate;
    onAutoCapture = onAutoCaptureReady;
    autoCaptureEnabled = autoCapture;
    autoCaptured = false;
    readyStreak = 0;
    prevBox = null;
    const myGeneration = ++generation;

    let mediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
    } catch (e) {
      return { ok: false, error: e.name === 'NotAllowedError' ? 'denied' : 'unavailable' };
    }
    if (myGeneration !== generation) {
      // stop() was already called (screen navigated away) while permission was pending.
      mediaStream.getTracks().forEach(t => t.stop());
      return { ok: false, error: 'superseded' };
    }
    stream = mediaStream;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    guidanceTimer = setInterval(runGuidanceTick, GUIDANCE_INTERVAL_MS);
    return { ok: true };
  }

  function runGuidanceTick() {
    if (!videoEl || videoEl.readyState < 2) return;
    const w = 240, h = Math.round(240 * (videoEl.videoHeight / videoEl.videoWidth || 1.4));
    const canvas = getScratchCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    let imageData;
    try { imageData = ctx.getImageData(0, 0, w, h); } catch (e) { return; }

    const analysis = analyzeFrame(imageData);
    if (onGuidance) onGuidance(analysis);

    if (analysis.ready) readyStreak++; else readyStreak = 0;

    if (autoCaptureEnabled && !autoCaptured && readyStreak >= READY_STREAK_NEEDED) {
      autoCaptured = true;
      if (onAutoCapture) onAutoCapture();
    }
  }

  // ---------- generic "is a sheet of paper framed well?" check ----------
  // No template needed: find the bright page against its (usually darker)
  // surroundings with an Otsu threshold, then check size, edges, focus,
  // light and stability. Works for any OMR sheet.
  function otsuThreshold(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
    const total = gray.length;
    let sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let wB = 0, sumB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    return thr;
  }

  function analyzeFrame(imageData) {
    const g = ImageProcessor.toGrayscale(imageData);
    const { gray, width, height } = g;
    const brightness = ImageProcessor.averageBrightness(g);
    const sharpness = ImageProcessor.sharpnessScore(g);
    const thr = otsuThreshold(gray);

    const cols = new Uint32Array(width), rows = new Uint32Array(height);
    let bright = 0, hot = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = gray[y * width + x];
        if (v > thr) { cols[x]++; rows[y]++; bright++; if (v > 250) hot++; }
      }
    }
    const total = width * height;
    const brightFrac = bright / total;

    let box = null, coverage = 0, fill = 0, touchesEdge = false;
    if (thr > 70 && brightFrac > 0.10 && brightFrac < 0.92) {
      const range = (arr, n) => {
        const lo = bright * 0.015, hi = bright * 0.985;
        let acc = 0, a = 0, b = n - 1;
        for (let i = 0; i < n; i++) { acc += arr[i]; if (acc >= lo) { a = i; break; } }
        acc = 0;
        for (let i = 0; i < n; i++) { acc += arr[i]; if (acc >= hi) { b = i; break; } }
        return [a, b];
      };
      const [x0, x1] = range(cols, width), [y0, y1] = range(rows, height);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      coverage = (bw * bh) / total;
      fill = bright / Math.max(1, bw * bh);
      touchesEdge = x0 <= width * 0.012 || y0 <= height * 0.012 || x1 >= width * 0.988 || y1 >= height * 0.988;
      if (fill > 0.5 && coverage > 0.08) box = { cx: (x0 + x1) / 2 / width, cy: (y0 + y1) / 2 / height, w: bw / width, h: bh / height };
    }
    const pageFound = !!box;

    let moved = false;
    if (box && prevBox) moved = Math.hypot(box.cx - prevBox.cx, box.cy - prevBox.cy) > 0.03 || Math.abs(box.w - prevBox.w) > 0.05;
    prevBox = box;

    const glare = bright ? hot / bright : 0;
    let message, status;
    if (brightness < 60) { message = 'More light needed'; status = 'dark'; }
    else if (!pageFound) { message = 'Place the whole sheet inside the frame'; status = 'searching'; }
    else if (glare > 0.45) { message = 'Too much glare \u2014 tilt the sheet'; status = 'glare'; }
    else if (touchesEdge && coverage > 0.6) { message = 'Move farther away \u2014 show the whole sheet'; status = 'close'; }
    else if (coverage < 0.42) { message = 'Move closer'; status = 'far'; }
    else if (sharpness < 18) { message = 'Hold steady \u2014 focusing'; status = 'blurry'; }
    else if (moved) { message = 'Hold steady'; status = 'moving'; }
    else { message = 'Sheet detected \u2014 hold steady'; status = 'ready'; }

    return { brightness, glare, sharpness, allFound: pageFound, coverage, status, message, ready: status === 'ready' };
  }

  function resetAutoCapture() { autoCaptured = false; readyStreak = 0; }

  function setAutoCapture(enabled) { autoCaptureEnabled = enabled; }

  function captureFullResolution() {
    if (!videoEl) return null;
    const w = videoEl.videoWidth, h = videoEl.videoHeight;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);
    return canvas;
  }

  // Best-quality capture: a real full-resolution still via ImageCapture when the
  // browser supports it (typically 12MP+, far sharper than a video frame), else a video frame.
  async function captureStill() {
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (track && typeof ImageCapture !== 'undefined') {
      try {
        const blob = await new ImageCapture(track).takePhoto();
        if (blob && blob.size > 20000) return await loadImageFileToCanvas(blob);
      } catch (e) { /* fall back to the video frame below */ }
    }
    return captureFullResolution();
  }

  let scratch = null;
  function getScratchCanvas(w, h) {
    if (!scratch) scratch = document.createElement('canvas');
    scratch.width = w; scratch.height = h;
    return scratch;
  }

  function stop() {
    generation++; // invalidates any in-flight start() so it can't assign a stream after this
    if (guidanceTimer) clearInterval(guidanceTimer);
    guidanceTimer = null;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (videoEl) videoEl.srcObject = null;
    videoEl = null;
    onGuidance = null; onAutoCapture = null;
  }

  function loadImageFileToCanvas(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  return { _analyzeFrame: analyzeFrame, start, stop, captureFullResolution, captureStill, resetAutoCapture, setAutoCapture, loadImageFileToCanvas };
})();
