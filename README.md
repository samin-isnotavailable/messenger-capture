# Tauri + Vanilla

This template should help get you started developing with Tauri in vanilla HTML, CSS and Javascript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Browser Extension

To capture tasks directly from Messenger:

➡ Go to: `messenger-extension/`

Follow the setup guide there to install the extension in Brave/Chrome.

This allows:
- Right-click → Save to Tracker
- Direct task capture from Messenger

# Messenger Task Capture

A lightweight task tracking system built for capturing and managing operational tasks directly from Messenger or any web page.

---

## Overview

This system allows users to:

* Capture tasks instantly from Messenger using a browser extension
* Manage tasks in a shared dashboard
* Track task status (pending / done)
* See who completed each task
* Work in real-time across multiple users

---

## Features

* Authentication (Supabase Auth)
* Real-time task updates
* Task creation, update, and deletion
* Done tracking (who completed the task)
* Browser extension for quick capture
* Admin-only delete control

---

## Live Dashboard

Access the app here:

https://messenger-capture.vercel.app

---

## Tech Stack

* Frontend: Vite + Vanilla JavaScript
* Backend: Supabase (Database + Auth + Realtime)
* Hosting: Vercel
* Extension: Chrome/Brave Extension (Manifest v3)

---

## Browser Extension

To capture tasks directly from Messenger:

➡ Go to the extension folder:
`messenger-extension/`

Follow the setup guide inside to install the extension.

### What it does

* Select text on Messenger or any webpage
* Right click → **Save to Tracker**
* Task is instantly added to the dashboard

---

## Usage Flow

1. User logs into the dashboard
2. User logs into the browser extension
3. User selects text from Messenger
4. Right click → Save to Tracker
5. Task appears in dashboard
6. Team members update task status in real-time

---

## Permissions

* Only authenticated users can:

  * View tasks
  * Create tasks
  * Update tasks

* Only admin can:

  * Delete tasks

---

## Project Structure

```
messenger-capture/
├── src/                  # Frontend logic
├── src-tauri/            # Desktop build (optional)
├── messenger-extension/  # Browser extension
├── index.html
├── package.json
└── README.md
```

---

## Setup (Local Development)

```bash
npm install
npm run dev
```

---

## Notes

* Supabase Row Level Security (RLS) is enforced
* All database access is controlled via authenticated users
* No sensitive keys (service role) are exposed

---

## Future Improvements

* Task assignment system
* Priority levels
* Role-based access (multiple admins)
* Improved UI (kanban-style board)
* Extension UX enhancements

---

## Author

Built by: Mubarrat Ahmed Samin
