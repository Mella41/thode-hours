## Thode Hours Tracker

Simple website where you and your friends can:

- Sign up and log in
- Record what time you arrived at Thode and what time you left each day
- See your total hours at Thode for the current month
- See a monthly leaderboard of everyone’s total hours

### Requirements

- Node.js (version 18+ recommended)

### Setup

1. Open a terminal in the `thode-hours` folder (where `package.json` lives).
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open your browser and go to:

```text
http://localhost:3000
```

### How it works

- Backend: Node.js + Express with PostgreSQL (Supabase-hosted via `DATABASE_URL`).
- Frontend: Plain HTML/CSS/JavaScript in the `public` folder.
- Authentication uses JWT + bcrypt password hashing, with user data stored in PostgreSQL.
- After logging in, the app:
  - Lets you add daily entries with date, arrival time, and departure time.
  - Calculates hours from arrival/departure for each entry.
  - Shows your total hours this month plus a table of your logs.
  - Shows a leaderboard for the current month for all users.

### Metrics verification (resume-safe)

for usage numbers  use aggregate SQL in Supabase SQL Editor.

#### 1) Total registered users

```sql
SELECT COUNT(*) AS total_registered_users
FROM users;
```

#### 2) Peak active month (highest monthly active users)

```sql
SELECT
  substr(date, 1, 7) AS month,
  COUNT(DISTINCT user_id) AS monthly_active_users
FROM time_logs
GROUP BY substr(date, 1, 7)
ORDER BY monthly_active_users DESC, month DESC
LIMIT 1;
```

#### 3) Total logged sessions

```sql
SELECT COUNT(*) AS total_logged_sessions
FROM time_logs;
```

#### 4) Current checked-in users

```sql
SELECT COUNT(*) AS currently_checked_in_users
FROM current_presence;
```


