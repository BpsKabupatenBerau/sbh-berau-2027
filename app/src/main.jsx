import './styles.css';
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Turn any load-time crash (e.g. missing Supabase env) into a readable message, never a blank page.
function fatal(err) {
  const msg = (err && err.message) || String(err || 'Kesalahan tidak diketahui');
  const root = document.getElementById('root');
  if (!root || document.querySelector('.shell, .login-wrap, .boot')) return;
  root.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px;' +
    'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f3f5f8">' +
    '<div style="max-width:440px;background:#fff;border:1px solid #e3e8ee;border-radius:16px;padding:22px;' +
    'box-shadow:0 2px 10px rgba(16,32,48,.06)">' +
    '<div style="font-weight:800;font-size:17px;margin-bottom:8px;color:#16202b">SBH 2027 gagal dimuat</div>' +
    '<div style="color:#4a5666;font-size:14px;line-height:1.55">' + msg.replace(/</g, '&lt;') + '</div></div></div>';
}
window.addEventListener('error', (e) => fatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));

// Dynamic import so a throw inside the app (config/env) is caught here instead of blanking the page.
import('./App.jsx')
  .then(({ default: App }) => {
    createRoot(document.getElementById('root')).render(createElement(StrictMode, null, createElement(App)));
  })
  .catch(fatal);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
