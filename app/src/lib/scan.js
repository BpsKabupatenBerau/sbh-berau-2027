// Document scanning helpers (all on-device, no server):
//  - load a camera photo into a working canvas (downscaled)
//  - straighten a 4-corner quad with a perspective (homography) warp
//  - "scan" filter: removes uneven lighting/shadows, whitens paper, darkens ink
//  - pages -> one A4 PDF (jsPDF, loaded only when needed)

const WORK_MAX = 2400;   // working resolution of the source photo
const OUT_MAX = 1500;    // longest side of a scanned page (≈150 dpi on A4)

export async function loadToCanvas(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const s = Math.min(1, WORK_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export function rotateCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.height; c.height = src.width;
  const g = c.getContext('2d');
  g.translate(c.width, 0); g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

export function defaultCorners(w, h, inset = 0.05) {
  const dx = w * inset, dy = h * inset;
  return [{ x: dx, y: dy }, { x: w - dx, y: dy }, { x: w - dx, y: h - dy }, { x: dx, y: h - dy }]; // tl,tr,br,bl
}

// ---- linear algebra: 8x8 solve for the homography ----
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) throw new Error('Sudut dokumen tidak valid');
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}
/** h maps (u,v) in `from` space to `to` space. */
export function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return solve(A, b);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Straighten the quad (tl,tr,br,bl in source px) into a flat page canvas. */
export function warpQuad(src, q) {
  let W = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, OUT_MAX / Math.max(W, H));
  W = Math.max(50, Math.round(W * s)); H = Math.max(50, Math.round(H * s));
  const h = homography(
    [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], q,
  );
  const sw = src.width, sh = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d');
  const img = og.createImageData(W, H); const od = img.data;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
  let o = 0;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++, o += 4) {
      const d = h6 * u + h7 * v + 1;
      let x = (h0 * u + h1 * v + h2) / d, y = (h3 * u + h4 * v + h5) / d;
      if (x < 0) x = 0; else if (x > sw - 1.001) x = sw - 1.001;
      if (y < 0) y = 0; else if (y > sh - 1.001) y = sh - 1.001;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
        const bot = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
        od[o + c] = top + (bot - top) * fy;
      }
      od[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

/** In-place filter. mode: 'doc' (clean black & white scan) | 'color' (light enhance). */
export function applyFilter(canvas, mode) {
  const W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, W, H); const d = img.data;
  if (mode === 'color') {
    for (let i = 0; i < d.length; i += 4)
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - 128) * 1.15 + 140));
    g.putImageData(img, 0, 0);
    return canvas;
  }
  // background (paper + lighting) estimate: heavy blur via down/up-scaling
  const bw = Math.max(8, Math.round(W / 24)), bh = Math.max(8, Math.round(H / 24));
  const small = document.createElement('canvas'); small.width = bw; small.height = bh;
  const sg = small.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(canvas, 0, 0, bw, bh);
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  const bg = big.getContext('2d'); bg.imageSmoothingQuality = 'high'; bg.drawImage(small, 0, 0, W, H);
  const bd = bg.getImageData(0, 0, W, H).data;
  const hist = new Uint32Array(256);
  const lum = new Uint8ClampedArray(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const b = Math.max(1, 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2]);
    const v = Math.min(255, (l / b) * 245);    // divide out lighting
    lum[p] = v; hist[lum[p]]++;
  }
  // contrast stretch between 2nd and 98th percentile
  const n = W * H; let acc = 0, lo = 0, hi = 255;
  for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc > n * 0.02) { lo = k; break; } }
  acc = 0;
  for (let k = 255; k >= 0; k--) { acc += hist[k]; if (acc > n * 0.02) { hi = k; break; } }
  const span = Math.max(30, hi - lo);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let v = ((lum[p] - lo) / span) * 255;
    v = v > 205 ? 255 : v < 0 ? 0 : v * 0.92;   // white paper, crisp ink
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

export const canvasToBlob = (c, q = 0.78) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));

const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

/** pages: [{ blob, w, h }] -> one PDF Blob, each page fitted on A4 with a small margin. */
export async function pagesToPdf(pages) {
  const { jsPDF } = await import('jspdf');
  let doc = null;
  for (const p of pages) {
    const land = p.w > p.h;
    const [pw, ph] = land ? [297, 210] : [210, 297];
    if (!doc) doc = new jsPDF({ orientation: land ? 'l' : 'p', unit: 'mm', format: 'a4', compress: true });
    else doc.addPage('a4', land ? 'l' : 'p');
    const m = 6, aw = pw - 2 * m, ah = ph - 2 * m;
    const s = Math.min(aw / p.w, ah / p.h);
    const w = p.w * s, h = p.h * s;
    doc.addImage(await blobToDataUrl(p.blob), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'FAST');
  }
  return doc.output('blob');
}
