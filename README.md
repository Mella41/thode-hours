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

- Backend: Node.js + Express with a local SQLite database file (`data.sqlite`) using `better-sqlite3`.
- Frontend: Plain HTML/CSS/JavaScript in the `public` folder.
- Authentication is simple: email + password stored in the local database (for personal use only, not production-secure).
- After logging in, the app:
  - Lets you add daily entries with date, arrival time, and departure time.
  - Calculates hours from arrival/departure for each entry.
  - Shows your total hours this month plus a table of your logs.
  - Shows a leaderboard for the current month for all users.

