// Photo compression + GPS capture, done on the phone before upload.

const MAX_SIDE = 1280;
const QUALITY = 0.72;

/** Resize to max 1280px and re-encode as JPEG (~150–300 KB). PDFs pass through. */
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bmp.width, h = bmp.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('Gagal memproses foto');
  return blob; // always JPEG, so the declared type is always right
}

/** One-shot GPS reading. Resolves null if denied/unavailable (never rejects). */
export function getPosition(timeout = 12000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
