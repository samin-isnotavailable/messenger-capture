// Product rules that are likely to change live here, in one place.

export const STATUSES = ['inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'];

// Dot colour per status (Kanban column headers, status pips).
export const STATUS_DOT = {
  inbox: 'bg-slate-400',
  assigned: 'bg-cyanaccent-400',
  in_progress: 'bg-blue-500',
  review: 'bg-indigo-400',
  done: 'bg-slate-500',
  blocked: 'bg-red-400',
};

// Priority drives the left stripe and the priority pill.
export const PRIORITY = {
  high: {
    stripe: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]',
    pill: 'bg-red-950/80 text-red-300 border-red-700/50',
    dot: 'bg-red-500',
    hoverBorder: 'hover:border-red-500/60',
  },
  medium: {
    stripe: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]',
    pill: 'bg-blue-950/80 text-blue-300 border-blue-700/50',
    dot: 'bg-blue-500',
    hoverBorder: 'hover:border-techblue-500/60',
  },
  low: {
    stripe: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]',
    pill: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50',
    dot: 'bg-emerald-500',
    hoverBorder: 'hover:border-emerald-500/60',
  },
};

// Task natures per department, keyed by departments.name.
// Website keeps its five. Graphics and Pre Order lists are still to be
// decided, so they only offer "Other" (which requires a written detail)
// until their own lists are added here.
export const DEPT_TASK_TYPES = {
  Website: ['upload', 'seo', 'image', 'price_change', 'other'],
  Graphics: ['other'],
  'Pre Order': ['other'],
};
export const FALLBACK_TASK_TYPES = ['other'];

// Department tag colours (Stitch DESIGN.md: Website teal, Graphics
// violet, Pre Order amber). Unknown departments fall back to slate.
export const DEPT_TAG = {
  Website: 'bg-teal-950/70 text-teal-300 border-teal-700/50',
  Graphics: 'bg-violet-950/70 text-violet-300 border-violet-700/50',
  'Pre Order': 'bg-amber-950/70 text-amber-300 border-amber-700/50',
};
export const DEPT_BAR = {
  Website: 'bg-teal-400',
  Graphics: 'bg-violet-400',
  'Pre Order': 'bg-amber-400',
};
export const DEFAULT_DEPT_TAG = 'bg-slate-800 text-slate-300 border-slate-700';

export const SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'website', label: 'Website capture' },
  { value: 'messenger', label: 'Messenger capture' },
];

export const ROLES = ['staff', 'manager', 'super_admin'];
