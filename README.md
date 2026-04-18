## Thode Hours Tracker

Thode Hours Tracker is a web app for tracking study time at Thode, seeing who is currently there, and comparing progress with friends.

## What the website does

- Account system with sign up and login
- Manual hour logging for today/yesterday
- Check-in/check-out presence tracking ("At Thode right now")
- Monthly and all-time leaderboards
- Achievement system based on streaks, study hours, and productivity
- Recent activity feed and daily highlights
- Feedback form and password reset flows

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript (`public/`)
- **Backend:** Node.js + Express (`server.js`)
- **Database:** PostgreSQL (typically via Supabase)
- **Auth/Security:** JWT + bcrypt
- **Email:** Nodemailer for password reset links

## Quick start

### Requirements

- Node.js 18+ recommended
- A PostgreSQL database URL

### Environment variables

Create environment variables before running:

- `DATABASE_URL` (required)
- `JWT_SECRET` (recommended)
- Optional mail config for reset emails:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `FROM_EMAIL`
- Optional behavior tuning:
  - `AUTO_CHECK_OUT_MAX_CONTINUOUS_HOURS` (default `25`)
  - `AUTO_CHECK_OUT_SWEEP_INTERVAL_MS` (default `300000`)
  - `CORS_ALLOWED_ORIGINS` (comma-separated list; leave empty for local dev)
  - `ADMIN_TOKEN` (recommended in production for admin endpoints)

### Run locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## How presence + auto-checkout works

- Checking in adds you to the current presence list.
- Checking out removes you from that list.
- If someone forgets to check out, a background sweep auto-checks them out after they have been continuously checked in for 25+ hours (default), without creating a time log entry.

## Project structure

- `server.js` - backend routes, DB schema init, auth, achievements, presence logic
- `public/index.html` - main app page
- `public/app.js` - client-side app behavior
- `public/styles.css` - styling/theme/layout
- `public/reset.html` - token-based password reset page

## Notes

- The app stores and computes study history from `time_logs`.
- Presence (`current_presence`) is separate from logged study entries.
- API routes are under `/api/*`.
- In production, set a strong `JWT_SECRET` and configure `CORS_ALLOWED_ORIGINS`.

