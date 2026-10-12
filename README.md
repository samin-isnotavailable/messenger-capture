# Taskapture

Capture it. Assign it. Get it done.

Rebrand and rebuild of `messenger-capture`, on the same Supabase project
("Messenger Ops Tracker") so all existing tasks are preserved. See
`supabase/migrations/` for the schema history.

## Status

v3 UI, built from the Stitch "Obsidian Kinetic" designs (task board +
admin console). Vite + vanilla JS + Tailwind, Supabase for auth, data,
row-level security and realtime.

**Board** (`src/board.js`)
- Department tabs (All / Website / Graphics / Pre Order / Unsorted).
  Staff only ever see their own department, even if they edit the URL.
- Quick input: type or paste a link, press Enter, and the task is
  configured in a modal before anything is saved. Department, at least
  one task nature and at least one assignee are required, so a task
  posted from **All** always lands in a real department.
- Pasted links are resolved to the page title (`api/resolve-title.js`,
  Vercel function). Legacy rows that stored "URL + SEO" as text are
  shown as a readable title plus a link chip without changing the data.
- List and Kanban views, Hide Done, Assigned to me, status and source
  filters, and an Inbox "queued" counter. Kanban cards drag between
  status columns.
- Done tasks turn grey and struck through, with "DONE BY" and Reopen.
  Reopen asks you to untick whoever's part needs redoing; the database
  trigger moves the task back to In Progress.

**Task detail** (`src/modals.js`): edit title, link, department,
natures, priority and due date; tick each assignee's part (ticking for
someone else records you as "done by"); add or remove assignees
(managers and admins can remove).

**Admin console** (`src/admin.js`, super admin only, `#/admin`): team
roster with inline role / department / username editing and CSV export,
live KPI cards, per-department pipeline cards, and a live activity log.
All numbers are computed from real rows.

**Data layer** (`src/store.js`): one in-memory copy of departments,
profiles, tasks and assignees. Realtime events and our own writes both
patch it, and views redraw only the rows that changed.

Run every migration in `supabase/migrations/` in order. `0010` is
required for this version: it stamps new tasks with their creator and
lets creators, assignees and same-department staff edit tasks.

## Setup

### 1. Environment

```
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# (same project as messenger-capture — do not create a new one)
```

### 2. Install & run

```
npm install
npm run dev
```

### 3. Deploy

Push to GitHub, import in Vercel, set the same two env vars there.
Vercel auto-detects the Vite build.

### 4. Browser extension

1. Open `extension/config.js` and fill in the same Supabase URL/anon key.
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select the `extension/` folder.
3. Click the extension icon and sign in.
4. Select text on any page → right-click → **Create Task with Taskapture**.

## Project structure

```
taskapture/
├── src/
│   ├── main.js            # login, hash router (#/, #/board/<tab>, #/admin)
│   ├── auth.js             # sign in/out, role-aware session
│   ├── store.js            # shared state, realtime, all writes
│   ├── shell.js            # header, department tabs, footer
│   ├── board.js            # list + kanban board
│   ├── modals.js           # create task, task detail, confirm
│   ├── admin.js            # admin & governance console
│   ├── lib/                # config (statuses, natures, colours), utils, toast
│   ├── supabaseClient.js
│   └── style.css
├── extension/
│   ├── manifest.json
│   ├── background.js       # right-click → create task
│   ├── authClient.js
│   ├── popup.html / popup.js
│   └── config.js
├── supabase/migrations/
│   ├── 0001_init.sql       # historical snapshot, do not re-run
│   └── 0002_taskapture_upgrade.sql
└── vercel.json
```

## Next up

- Graphics and Pre Order task-nature lists (`src/lib/config.js`,
  `DEPT_TASK_TYPES`). Until then both departments only offer "Other",
  which requires a written detail.
- Extension: department / nature / assignee picker at capture time.
  Extension captures currently land in Unsorted for triage.
- Notifications (Discord webhook is the quick win).
- Cosmetic rebrand pass (logo, favicon, repo rename).
