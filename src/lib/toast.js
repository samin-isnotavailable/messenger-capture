import { esc, icon } from './util.js';

let timer = null;

export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  const tone =
    kind === 'error'
      ? 'border-red-700/70 text-red-200'
      : 'border-techblue-500/70 text-slate-100';
  const ic = kind === 'error' ? icon('error', 18, 'text-red-400') : icon('info', 18, 'text-cyanaccent-400');
  el.className = `fixed bottom-6 right-6 z-[60] bg-obsidian-850 border ${tone} text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 animate-toast-in max-w-sm`;
  el.innerHTML = `${ic}<span>${esc(message)}</span>`;
  clearTimeout(timer);
  timer = setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2400);
}
