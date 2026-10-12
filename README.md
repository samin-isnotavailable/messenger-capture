# Taskapture

Capture it. Assign it. Get it done.

Rebrand and rebuild of `messenger-capture`, on the same Supabase project
("Messenger Ops Tracker") so all existing tasks are preserved. See
`supabase/migrations/` for the schema history.

## Status

This is the v0.1 scaffold: auth, task list, add-task, and a realtime sync
that patches individual rows instead of re-rendering the whole list (the
fix for the old app's hard-refresh feeling). Departments (Website /
Graphics / Pre Order), multi-assignee tasks with per-person completion
and a separate "fulfilled by" (for when someone covers for someone
else), and task-type tagging are now live — see
`supabase/migrations/0004_departments_multiassignee.sql`.

There's no admin UI yet for assigning roles/departments — until then,
set them directly in the Supabase table editor on the `profiles` table:
`role` (`super_admin` / `manager` / `staff`) and `department_id`
(matches a row in the `departments` table). A `staff` profile with no
`department_id` set won't have a department tab to land on, so set this
for every staff account before they sign in.

Admin dashboard (role-gated delete, reassign-to-anyone, a real role/
department management UI) is intentionally still not built — RLS
already enforces the real permission boundaries at the database level,
so this is safe to ship incrementally.

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
│   ├── main.js            # routes between login and dashboard
│   ├── auth.js             # sign in/out, role-aware session
│   ├── dashboard.js        # task list + realtime patching
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

- Workflow status dropdown is live (inbox / assigned / in progress /
  review / done / blocked) — already wired into `dashboard.js`.
- Admin dashboard: role-gated assignment + delete UI on top of the
  existing RLS policies.
- Extension: assignee/priority picker at capture time.
- Cosmetic rebrand pass (logo, favicon, repo rename) — last, once the
  UI shape is settled.
