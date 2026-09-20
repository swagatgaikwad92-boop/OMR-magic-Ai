/* ============================================================
   imageProcessor.js — low-level, dependency-free image math.
   Everything the OMR scanner needs: grayscale conversion,
   projective (perspective) transforms via a 4-point homography,
   image warping, blur/brightness/glare estimation, and patch
   sampling for bubble darkness. No external CV library — this
   runs anywhere a Canvas does, including GitHub Pages.
   ============================================================ */

const ImageProcessor = (() => {

  // ---------- grayscale ----------
  function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      // Rec. 601 luma
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return { gray, width, height };
  }

  function grayAt(grayImg, x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= grayImg.width || yi >= grayImg.height) return 255;
    return grayImg.gray[yi * grayImg.width + xi];
  }

  function bilinearGray(grayImg, x, y) {
    const { gray, width, height } = grayImg;
    if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 255;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1, y1 = y0 + 1;
    const fx = x - x0, fy = y - y0;
    const g00 = gray[y0 * width + x0], g10 = gray[y0 * width + x1];
    const g01 = gray[y1 * width + x0], g11 = gray[y1 * width + x1];
    const top = g00 * (1 - fx) + g10 * fx;
    const bot = g01 * (1 - fx) + g11 * fx;
    return top * (1 - fy) + bot * fy;
  }

  // ---------- homography (4-point DLT, projective transform) ----------
  // Solves for H such that dst ~ H * src (homogeneous 3x3, H[8]=1)
  function computeHomography(srcPts, dstPts) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = srcPts[i];
      const { x: X, y: Y } = dstPts[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    const h = solveLinearSystem(A, b);
    if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function solveLinearSystem(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-10) return null;
      [M[col], M[pivot]] = [M[pivot], M[col]];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  function applyH(H, x, y) {
    const denom = H[6] * x + H[7] * y + H[8];
    return {
      x: (H[0] * x + H[1] * y + H[2]) / denom,
      y: (H[3] * x + H[4] * y + H[5]) / denom,
    };
  }

  function invertH(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    const G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    const inv = [A, D, G, B, E, Hh, C, F, I].map(v => v / det);
    return inv;
  }

  // ---------- warp a source canvas into reference (template) space ----------
  // H maps template coords -> source photo pixel coords. We invert direction
  // by iterating destination (template/output) pixels and sampling the source.
  function warpToTemplate(sourceGray, H, outW, outH, refW, refH) {
    const out = new Float32Array(outW * outH);
    const sx = refW / outW, sy = refH / outH;
    for (let oy = 0; oy < outH; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        const tx = ox * sx, ty = oy * sy; // template-space coordinate
        const src = applyH(H, tx, ty);
        out[oy * outW + ox] = bilinearGray(sourceGray, src.x, src.y);
      }
    }
    return { gray: out, width: outW, height: outH };
  }

  // ---------- quality metrics ----------
  function averageBrightness(grayImg) {
    let sum = 0;
    for (let i = 0; i < grayImg.gray.length; i++) sum += grayImg.gray[i];
    return sum / grayImg.gray.length;
  }

  function glareFraction(grayImg) {
    let hot = 0;
    for (let i = 0; i < grayImg.gray.length; i++) if (grayImg.gray[i] > 248) hot++;
    return hot / grayImg.gray.length;
  }

  // cheap sharpness estimate: variance of a simple Laplacian-like gradient,
  // sampled on a coarse grid for speed.
  function sharpnessScore(grayImg) {
    const { gray, width, height } = grayImg;
    const step = Math.max(2, Math.floor(Math.min(width, height) / 160));
    let sum = 0, sumSq = 0, n = 0;
    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const c = gray[y * width + x];
        const lap = 4 * c
          - gray[(y - step) * width + x] - gray[(y + step) * width + x]
          - gray[y * width + (x - step)] - gray[y * width + (x + step)];
        sum += lap; sumSq += lap * lap; n++;
      }
    }
    if (!n) return 0;
    const mean = sum / n;
    return sumSq / n - mean * mean; // variance
  }

  // ---------- patch sampling (for bubble darkness) ----------
  // Returns mean darkness (0 = white, 255 = black) inside a circular patch.
  function circleDarkness(grayImg, cx, cy, radius) {
    let sum = 0, n = 0;
    const rr = radius * radius;
    const step = Math.max(1, Math.floor(radius / 6));
    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        if (dx * dx + dy * dy > rr) continue;
        sum += 255 - bilinearGray(grayImg, cx + dx, cy + dy);
        n++;
      }
    }
    return n ? sum / n : 0;
  }

  return {
    toGrayscale, grayAt, bilinearGray,
    computeHomography, applyH, invertH, warpToTemplate,
    averageBrightness, glareFraction, sharpnessScore, circleDarkness,
  };
})();
