# Thode Hours - Deep Codebase Explanation

This document explains what each major part of the code does, how data flows through the app, and what the important behaviors are in production.

---

## 1) High-Level Architecture

The project is a single Node.js service that:

- serves a static frontend from `public/`
- exposes REST API routes under `/api/*`
- stores application data in PostgreSQL
- uses JWT auth for protected endpoints
- runs background maintenance (auto-checkout sweep)

Core runtime pieces:

- **Backend app:** `server.js`
- **Frontend app logic:** `public/app.js`
- **Main UI markup:** `public/index.html`
- **Password reset page:** `public/reset.html`
- **Styling:** `public/styles.css`
- **Dependencies/scripts:** `package.json`

---

## 2) Runtime Boot Sequence (`server.js`)

When `node server.js` runs:

1. Environment/config values are read (port, DB, JWT, SMTP, auto-checkout settings).
2. Express middleware is installed (`cors`, JSON parser, static files).
3. Postgres pool is created.
4. Database schema is initialized via `initDb()`.
5. `dbReady` is set `true` once schema init succeeds.
6. The background auto-checkout sweep starts.
7. HTTP server starts listening on `HOST:PORT`.

Extra resilience:

- `process.on('unhandledRejection')` and `process.on('uncaughtException')` log unexpected crashes.
- `console.error` is wrapped to compact error objects for cleaner logs.

---

## 3) Configuration and Environment Variables

Main env variables in use:

- `PORT`, `HOST`
- `DATABASE_URL` (required)
- `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`
- `JWT_SECRET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`
- `APP_BASE_URL` (used in reset-link emails)
- `ADMIN_TOKEN` (protects destructive admin endpoints if set)
- `AUTO_CHECK_OUT_MAX_CONTINUOUS_HOURS` (default `25`)
- `AUTO_CHECK_OUT_SWEEP_INTERVAL_MS` (default `300000` = 5 min)

Timezone behavior:

- `process.env.TZ` defaults to `America/Toronto` so date-based logic is stable.

---

## 4) Database Schema and Table Purpose

Schema is created by `initDb()` in `server.js`.

### `users`

- Identity/auth table.
- Key columns: `id`, `username`, `email`, `password`, `created_at`.
- `email` and `username` are unique.

### `time_logs`

- Historical logged sessions.
- Key columns: `user_id`, `date` (`YYYY-MM-DD` text), `arrival`, `departure`, `hours`, `productivity`.
- `hours` is computed on backend from arrival/departure.

### `current_presence`

- Real-time "currently at Thode" state.
- One row per currently checked-in user.
- Key columns: `user_id`, `checked_in_at`.
- This table powers presence lists and check-in status.

### `user_achievements`

- Materialized achievements by user and month.
- Key columns: `user_id`, `month` (`YYYY-MM`), `achievement_key`, `unlocked_at`.
- Unique tuple `(user_id, month, achievement_key)`.

### `password_resets`

- One-time reset tokens.
- Key columns: `user_id`, `token`, `expires_at`.

### `feedback_entries`

- User-submitted feedback text.
- Key columns: `user_id`, `message`, `created_at`.

---

## 5) Authentication Model

### Token creation

- `createToken(user)` signs JWT with `JWT_SECRET`, expiry `7d`.

### Route protection

- `authMiddleware` expects `Authorization: Bearer <token>`.
- Invalid or expired token returns `401`.

### Signup/login

- `POST /api/signup`
  - Requires username/email/password.
  - Enforces `@mcmaster.ca` domain.
  - Password hashed with `bcryptjs`.
- `POST /api/login`
  - Accepts either email or username in `identifier`.
  - Verifies password hash.

### Password changes while logged in

- `POST /api/verify-password` verifies current password.
- `POST /api/change-password` applies a new password (min length checks).

### Forgot/reset flow

- `POST /api/forgot-password`
  - Creates secure token (`crypto.randomBytes`), stores expiry.
  - Sends reset link by email via `nodemailer`.
- `POST /api/reset-password`
  - Validates token + expiry.
  - Updates password hash and consumes token.

---

## 6) Presence System (Check-In/Check-Out)

Presence endpoints:

- `GET /api/presence`: list checked-in users + caller's `isCheckedIn`
- `POST /api/presence/check-in`: insert row into `current_presence`
- `DELETE /api/presence/check-out`: remove caller row from `current_presence`

Important semantics:

- If user clicks check-in again while already checked in, the conflict handler **keeps the existing `checked_in_at`**.
- That preserves a single continuous session start timestamp until checkout.

Why this matters:

- Continuous-session length calculations are based on `checked_in_at`.
- Session timer should only reset after checkout + a new check-in.

---

## 7) Auto-Checkout Background Sweep

The app no longer uses a fixed 6:00 AM global checkout.

Current behavior:

- `scheduleAutoCheckOut()` runs:
  - once immediately on startup
  - then every `AUTO_CHECK_OUT_SWEEP_INTERVAL_MS` (min clamped to 1 minute)
- `autoCheckOutLongSessions()` removes only presence rows where:
  - `(now() - checked_in_at) >= threshold_hours`
  - threshold defaults to **25 hours**

Key guarantee:

- This removes entries from `current_presence` only.
- It **does not** insert `time_logs`.

Logging:

- Each sweep logs how many rows were removed and what threshold was used.

---

## 8) Time Logging Rules (`/api/logs`)

`POST /api/logs` enforces:

- authenticated user required
- productivity must be one of predefined values
- valid `HH:MM` parsing
- `departure > arrival`
- date allowed only for **today or yesterday**
- if date is today, no future times allowed
- overlap prevention against existing logs for same user/date

On success:

- inserts new row in `time_logs`
- runs monthly achievement sync
- returns new unlocks (`newAchievements`)

Deletion:

- `DELETE /api/logs/:id` allows deleting own logs only for today/yesterday
- re-syncs achievements for affected month

---

## 9) Achievements Engine

Main pieces:

- `ACHIEVEMENTS` static definitions
- `evaluateAchievementKeys(...)` computes achieved keys from logs
- `syncAchievementsForMonth(userId, month)` makes DB match computed truth

Computation dimensions include:

- streak length
- max daily hours
- weekly total hours
- productivity-weighted thresholds
- weekend conditions
- night windows (e.g., overlaps 2-3 AM, 3-5 AM)
- straight 24-hour sessions

Sync strategy:

- add missing earned achievements
- remove achievements no longer valid for that month
- prevent future-month phantom unlocks

---

## 10) Summary and Leaderboards

### `GET /api/summary`

Returns month payload:

- `totalHours`
- month logs list
- `achievementsCurrentMonth`
- `pastAchievements` grouped by month

### `GET /api/leaderboard`

- Month-scoped ranking.
- Returns total hours, average productivity, and streak per user.

### `GET /api/leaderboard/all-time`

- Same shape as monthly leaderboard, but no month filter.

Implementation details:

- Uses SQL aggregates for totals/productivity.
- Builds streaks by collecting distinct log dates up to streak-evaluation cutoff.

---

## 11) Activity Feed APIs

### `GET /api/activity/recent-achievements`

- Recent unlock feed across users.
- Limit constrained to 1..50; default 20.
- Restricts to unlocks in recent 14 days.

### `GET /api/activity/daily-highlights`

Computes "yesterday" highlights:

- longest time at Thode
- longest productive time
- most achievements unlocked
- highest active streak as of yesterday

---

## 12) Admin Endpoints

### `DELETE /api/admin/purge-non-mac-users`

- Deletes users not matching `@mcmaster.ca`.
- Cascades through related data by explicit delete queries.
- Optional protection via `X-Admin-Token` if `ADMIN_TOKEN` is set.

### `DELETE /api/admin/delete-all-users`

- Clears all users/logs/password resets.
- Same optional admin-token protection.

---

## 13) Frontend Structure (`public/index.html`)

`index.html` defines all major UI blocks:

- Auth card (login/signup)
- App dashboard:
  - month navigation
  - presence panel
  - recent activity + daily highlights
  - log form
  - logs table + achievements
  - monthly leaderboard
  - all-time leaderboard
  - check-out modal for optional log creation
  - past achievements modal
  - achievement-tier explorer
  - feedback form
  - in-app password reset wizard

All interactivity is wired in `public/app.js`.

---

## 14) Frontend Logic (`public/app.js`)

`app.js` is a large stateful controller for the entire UI.

### Theme + session

- Theme preference in `localStorage` (`thodeTheme`).
- Session (user + JWT) in `localStorage` (`thodeUser`).

### API wrapper

- `api(path, options)` adds JSON headers + bearer token.
- Parses response and normalizes errors.
- On `401`, clears session and forces auth screen.

### Auth UX

- Tabbed login/signup forms.
- On success: stores session and enters logged-in mode.

### Month navigation

- `selectedMonth` tracked as `YYYY-MM`.
- Prev/next buttons mutate selected month and refresh data.
- Log form is disabled unless month allows logging (today/yesterday rules).

### Summary + leaderboard rendering

- Renders logs table, totals, current/past achievements.
- Supports clicking leaderboard rows to view another user's monthly logs.

### Presence UI

- Polls `/api/presence` every 30s while logged in.
- Updates "Check in / Check out" button and active users list.

### Long check-in reminder

- Reminder thresholds:
  - initial prompt at 4h
  - repeat every 2h max
- If notifications are enabled and permitted, sends browser notification.
- Otherwise shows confirm dialog.
- Cancel path triggers checkout action.

### Check-out modal and log generation

- On checkout, app can create logs from check-in -> now.
- Handles same-day and overnight split:
  - overnight supported specifically for yesterday->today split
  - posts one or two `/api/logs` entries accordingly
- Then calls `/api/presence/check-out`.

### Activity panel

- Polls recent achievements + daily highlights every 30s.
- Auto-scrolls recent activity list for visibility.

### Feedback + password tools

- Feedback form posts to `/api/feedback`.
- Password wizard verifies current password first, then changes password.

---

## 15) Standalone Reset Page (`public/reset.html`)

This page supports email-token reset:

- Reads `token` from query string.
- Posts `{ token, password }` to `/api/reset-password`.
- Shows success/error feedback inline.

---

## 16) Styling (`public/styles.css`)

`styles.css` provides:

- Theme variables for light/dark mode
- App layout grids/cards/tables/modals
- Presence and activity visual treatment
- Achievement and leaderboard styling
- Responsive behavior for narrow screens

It is presentation-only (no business logic), but class names must match markup and JS selectors.

---

## 17) Health and Readiness Behavior

- `/healthz` returns `{ ok, dbReady, uptimeSeconds }`.
- `/api/*` requests are blocked with `503` until DB initialization finishes.
- Static pages can still load during DB warm-up.

---

## 18) Known Design Decisions and Constraints

- Dates are stored as text (`YYYY-MM-DD`) and months as text (`YYYY-MM`).
- Session logs are modeled as same-day intervals; overnight logs are split client-side.
- Presence does not automatically create logs on checkout/sweep.
- Auto-checkout is best-effort while Node process is alive.
- `README.md` is partially outdated (mentions SQLite) while current backend uses PostgreSQL.

---

## 19) Quick Endpoint Index

Auth/user:

- `POST /api/signup`
- `POST /api/login`
- `POST /api/verify-password`
- `POST /api/change-password`
- `POST /api/forgot-password`
- `POST /api/reset-password`

Logs and dashboards:

- `POST /api/logs`
- `DELETE /api/logs/:id`
- `GET /api/summary`
- `GET /api/leaderboard`
- `GET /api/leaderboard/all-time`

Presence/activity:

- `GET /api/presence`
- `POST /api/presence/check-in`
- `DELETE /api/presence/check-out`
- `GET /api/activity/recent-achievements`
- `GET /api/activity/daily-highlights`

Other:

- `POST /api/feedback`
- `DELETE /api/admin/purge-non-mac-users`
- `DELETE /api/admin/delete-all-users`
- `GET /healthz`

---

## 20) Practical Mental Model

If you need to debug quickly, think in this order:

1. **Frontend state** (`currentUser`, `selectedMonth`, `presenceState`) in `app.js`
2. **API contract** for the route in `server.js`
3. **DB shape/query** for route behavior
4. **Achievement sync side-effects** after log writes/deletes
5. **Background sweep effects** on presence (`current_presence`)

That sequence matches how most bugs emerge in this codebase.

