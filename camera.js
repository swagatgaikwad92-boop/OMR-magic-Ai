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
    const myGeneration = ++generation;

    let mediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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

    const analysis = OmrScanner.quickFrameAnalysis(imageData);
    if (onGuidance) onGuidance(analysis);

    if (analysis.ready) readyStreak++; else readyStreak = 0;

    if (autoCaptureEnabled && !autoCaptured && readyStreak >= READY_STREAK_NEEDED) {
      autoCaptured = true;
      if (onAutoCapture) onAutoCapture();
    }
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

  return { start, stop, captureFullResolution, resetAutoCapture, setAutoCapture, loadImageFileToCanvas };
})();
