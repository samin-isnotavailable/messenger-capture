export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const esc = escapeHtml;

export function icon(name, size = 16, extra = '') {
  return `<span class="ms ${extra}" style="font-size:${size}px">${name}</span>`;
}

// Team-wide avatar initials. Several people share first letters (Samin,
// Sajid, Shafiul), so the store registers a collision-free set whenever
// profiles load or change, and initials() prefers that.
const initialsRegistry = new Map();

export function registerInitials(labels) {
  initialsRegistry.clear();
  const taken = new Set();
  for (const label of labels) {
    if (!label || initialsRegistry.has(label)) continue;
    const base = plainInitials(label);
    const clean = String(label).split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const candidates = [base, ...[...clean.slice(1)].map((c) => clean[0] + c)];
    const pick = candidates.find((c) => c.length === 2 && !taken.has(c)) || base;
    taken.add(pick);
    initialsRegistry.set(label, pick);
  }
}

export function initials(label) {
  return initialsRegistry.get(label) || plainInitials(label);
}

function plainInitials(label) {
  if (!label) return '?';
  const clean = String(label).split('@')[0].replace(/[^a-zA-Z0-9 ._-]/g, '');
  const parts = clean.split(/[ ._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || '?';
}

// Keeps intentional single line breaks, trims each line, collapses runs
// of spaces, and caps blank lines at one.
export function normalizeWhitespace(str) {
  if (!str) return '';
  return String(str)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function typeLabel(type) {
  if (type === 'seo') return 'SEO';
  return String(type || 'other')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusLabel(status) {
  return String(status || 'inbox')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const BARE_URL_RE = /^https?:\/\/\S+$/i;
const LEADING_URL_RE = /^(https?:\/\/\S+)\s*([\s\S]*)$/i;

export function splitUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^www\./, ''), rest: u.pathname + u.search + u.hash };
  } catch {
    return { host: '', rest: url };
  }
}

export function friendlyLabelFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.searchParams.get('post_type') === 'product' && u.searchParams.get('p')) {
      return `Product #${u.searchParams.get('p')}`;
    }
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last).replace(/[-_]+/g, ' ').trim() || u.hostname;
    return u.hostname;
  } catch {
    return rawUrl;
  }
}

// Display-only cleanup. Many legacy rows store "https://...preview=true SEO"
// in the task text with no source_url. Split the leading URL out so the
// row shows a readable title plus a URL chip, without touching the data.
export function displayParts(task) {
  const text = normalizeWhitespace(task.task || '');
  if (task.source_url) {
    return { title: text || friendlyLabelFromUrl(task.source_url), url: task.source_url };
  }
  const m = text.match(LEADING_URL_RE);
  if (m) {
    const url = m[1];
    const rest = normalizeWhitespace(m[2]);
    const base = friendlyLabelFromUrl(url);
    return { title: rest ? `${base} · ${rest.replace(/\n+/g, ' ')}` : base, url };
  }
  return { title: text || '(untitled)', url: null };
}

function stripSiteSuffix(title) {
  return title.replace(/\s*[-–—|]\s*(EZ\s*Gadgets|ggezgadgets(\.com)?)\s*$/i, '').trim();
}

export async function resolveUrlTitle(rawUrl) {
  try {
    const res = await fetch(`/api/resolve-title?url=${encodeURIComponent(rawUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title ? stripSiteSuffix(data.title) : null;
  } catch {
    return null;
  }
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d) ? '' : dateFmt.format(d);
}
export function fmtShort(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d) ? '' : shortFmt.format(d);
}
export function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d) ? '' : `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}
export function fmtTime(value) {
  const d = new Date(value);
  return isNaN(d) ? '' : timeFmt.format(d);
}

export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(value);
}

// Task age from created_at: <1h, 5h, 3d, 2w. Five days or older counts
// as stale (amber on the board). Tooltip gets the full local timestamp.
export const STALE_DAYS = 5;
export function taskAge(createdAt) {
  const created = new Date(createdAt);
  if (!createdAt || isNaN(created)) return null;
  const hours = Math.max(0, Math.floor((Date.now() - created.getTime()) / 3600000));
  const days = Math.floor(hours / 24);
  let label = '<1h';
  if (days >= 7) label = `${Math.floor(days / 7)}w`;
  else if (days >= 1) label = `${days}d`;
  else if (hours >= 1) label = `${hours}h`;
  return { label, days, stale: days >= STALE_DAYS, full: `Created ${fmtDateTime(created)}` };
}

// due_date is a plain date (YYYY-MM-DD). Overdue means the whole day passed.
export function isOverdue(task) {
  if (!task.due_date || task.workflow_status === 'done') return false;
  const end = new Date(`${task.due_date}T23:59:59`);
  return end.getTime() < Date.now();
}

export function isDueToday(task) {
  if (!task.due_date) return false;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return task.due_date === iso;
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}
