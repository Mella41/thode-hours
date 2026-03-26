const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
// Ensure "6:00 AM" auto-checkout uses a consistent timezone.
// If your server is already configured for America/Toronto, this is harmless.
process.env.TZ = process.env.TZ || 'America/Toronto';
const MAC_EMAIL_DOMAIN = '@mcmaster.ca';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
let dbReady = false;

const AUTO_CHECK_OUT_HOUR = Number(process.env.AUTO_CHECK_OUT_HOUR || 6); // 0-23
const AUTO_CHECK_OUT_MINUTE = Number(process.env.AUTO_CHECK_OUT_MINUTE || 0);
let lastAutoCheckOutISODate = null;

async function autoCheckOutEveryone() {
  // “Check out” means remove presence rows only (no time_logs inserted).
  await dbQuery('DELETE FROM current_presence');
}

function scheduleAutoCheckOut() {
  // Best-effort: this runs while the Node server is running.
  const now = new Date();
  const next = new Date(now);
  next.setHours(AUTO_CHECK_OUT_HOUR, AUTO_CHECK_OUT_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const msUntil = next.getTime() - now.getTime();
  setTimeout(async () => {
    try {
      const todayISO = getCurrentDateISO();
      if (lastAutoCheckOutISODate !== todayISO) {
        await autoCheckOutEveryone();
        lastAutoCheckOutISODate = todayISO;
        console.log(`Auto check-out executed at ${AUTO_CHECK_OUT_HOUR}:${AUTO_CHECK_OUT_MINUTE}.`);
      }
    } catch (err) {
      console.error('Auto check-out failed.', err);
    } finally {
      scheduleAutoCheckOut(); // schedule next day
    }
  }, msUntil);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database (Postgres/Supabase) setup
if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL. Add it in your environment variables.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase requires SSL; this is the common Node config for it
  ssl: { rejectUnauthorized: false }
});

async function dbQuery(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS time_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      arrival TEXT NOT NULL,
      departure TEXT NOT NULL,
      hours DOUBLE PRECISION NOT NULL,
      productivity TEXT NOT NULL DEFAULT 'Super locked',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, month, achievement_key)
    );

    CREATE TABLE IF NOT EXISTS current_presence (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS feedback_entries (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// Mail transporter (configure via environment)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function computeHours(arrival, departure) {
  const start = parseTimeToMinutes(arrival);
  const end = parseTimeToMinutes(departure);
  if (start === null || end === null || end <= start) return null;
  return (end - start) / 60;
}

function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayISO() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ACHIEVEMENTS = [
  { key: 'welcome_to_thode', tier: 'D', title: 'Welcome to Thode', subtitle: 'Unlock a 3-day streak' },
  { key: 'getting_comfortable', tier: 'D', title: 'Getting Comfortable', subtitle: 'Spend 3 hours at Thode in one day' },
  { key: 'warm_up_session', tier: 'D', title: 'Warm-Up Session', subtitle: 'Achieved productivity level 3 for 4+ hours in one day' },
  { key: 'in_the_zone', tier: 'C', title: 'In the Zone', subtitle: 'Reach a 5-day streak' },
  { key: 'half_day_warrior', tier: 'C', title: 'Half-Day Warrior', subtitle: 'Spend 5 hours at Thode in one day' },
  { key: 'academic_night_owl', tier: 'C', title: 'Academic Night Owl', subtitle: 'Stay at Thode past 11 PM' },
  { key: 'steady_grind', tier: 'C', title: 'Steady Grind', subtitle: 'Locked (level 4) for 5+ hours in one day' },
  { key: 'weekly_regular', tier: 'B', title: 'Weekly Regular', subtitle: 'Reach a 7-day streak' },
  { key: 'committed', tier: 'B', title: 'Committed', subtitle: 'Spend 7 hours at Thode in one day' },
  { key: 'weekend_scholar', tier: 'B', title: 'Weekend Scholar', subtitle: 'Study 4+ hours on a weekend day' },
  { key: 'almost_full_time_thoder', tier: 'A', title: 'Almost a Full-Time Thoder', subtitle: 'Spend 30 hours in one week' },
  { key: 'now_you_have_to_ace_it', tier: 'A', title: 'Now You Have to Ace It', subtitle: 'Spend 12 hours at Thode in one day' },
  { key: 'full_time_thoder', tier: 'S', title: 'Full-Time Thoder', subtitle: 'Spend 40 hours in one week' },
  { key: 'night_shift', tier: 'S', title: 'The Night Shift', subtitle: 'Stay at Thode past 2:00 AM' },
  { key: 'employee_of_the_month', tier: 'SS', title: 'Thode Employee of the Month', subtitle: '44+ hours in one week' },
  { key: 'villain_origin_story', tier: 'SS', title: 'Villain Origin Story', subtitle: 'Be at Thode between 3:00-5:00 AM' },
  { key: 'go_home_please', tier: 'SSS', title: 'Go Home. Please.', subtitle: '18-day streak' },
  { key: 'academic_victim', tier: 'SSS', title: 'Academic Victim', subtitle: '24 hours straight at Thode' }
];

const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

function getProductivityScore(productivity) {
  switch (productivity) {
    case 'Super locked':
      return 5;
    case 'Locked':
      return 4;
    case 'Studying with a side of yap':
      return 3;
    case 'Yap with a side of study':
      return 2;
    case 'Did basically nothing':
      return 1;
    default:
      return 0;
  }
}

function getDateOnly(isoDate) {
  return new Date(isoDate + 'T00:00:00');
}

function getCurrentStreak(dates, todayISO) {
  const validDates = [...new Set(dates)].filter((d) => d <= todayISO).sort();
  if (validDates.length === 0) return 0;
  let streak = 1;
  let i = validDates.length - 1;
  let prev = validDates[i];
  while (i > 0) {
    const curr = validDates[i - 1];
    const diffDays = (getDateOnly(prev) - getDateOnly(curr)) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      streak += 1;
      prev = curr;
      i -= 1;
    } else {
      break;
    }
  }
  return streak;
}

function getWeekKey(isoDate) {
  const d = getDateOnly(isoDate);
  const day = d.getDay(); // 0 (Sun) .. 6 (Sat)
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function overlapsWindow(startMin, endMin, winStart, winEnd) {
  return startMin < winEnd && endMin > winStart;
}

function evaluateAchievementKeys(logs, todayISO) {
  const dates = [];
  const dayHours = new Map();
  const weekHours = new Map();
  let maxDayHours = 0;
  const level3ByDay = new Map();
  const lockedByDay = new Map();
  let after11pm = false;
  let after2am = false;
  let villainWindow = false;
  let weekendScholar = false;
  let straight24 = false;

  for (const log of logs) {
    const date = log.date;
    const hours = Number(log.hours || 0);
    const score = getProductivityScore(log.productivity);
    const startMin = parseTimeToMinutes(log.arrival);
    const endMin = parseTimeToMinutes(log.departure);

    dates.push(date);

    const daily = (dayHours.get(date) || 0) + hours;
    dayHours.set(date, daily);
    if (daily > maxDayHours) maxDayHours = daily;

    const weekKey = getWeekKey(date);
    weekHours.set(weekKey, (weekHours.get(weekKey) || 0) + hours);

    if (score >= 3) level3ByDay.set(date, (level3ByDay.get(date) || 0) + hours);
    if (score >= 4) lockedByDay.set(date, (lockedByDay.get(date) || 0) + hours);

    if (hours >= 24) straight24 = true;

    if (endMin != null && endMin >= 23 * 60) after11pm = true;
    // Night Shift only if a session overlaps 2:00-3:00 AM.
    if (startMin != null && endMin != null && overlapsWindow(startMin, endMin, 2 * 60, 3 * 60)) {
      after2am = true;
    }
    if (startMin != null && endMin != null && overlapsWindow(startMin, endMin, 3 * 60, 5 * 60)) {
      villainWindow = true;
    }
  }

  let maxLevel3DayHours = 0;
  for (const h of level3ByDay.values()) {
    if (h > maxLevel3DayHours) maxLevel3DayHours = h;
  }

  let maxLockedDayHours = 0;
  for (const h of lockedByDay.values()) {
    if (h > maxLockedDayHours) maxLockedDayHours = h;
  }

  for (const [date, hours] of dayHours.entries()) {
    const d = getDateOnly(date);
    const day = d.getDay();
    if ((day === 0 || day === 6) && hours >= 4) {
      weekendScholar = true;
      break;
    }
  }

  let maxWeekHours = 0;
  for (const h of weekHours.values()) {
    if (h > maxWeekHours) maxWeekHours = h;
  }

  const streak = getCurrentStreak(dates, todayISO);
  const achieved = new Set();

  if (streak >= 3) achieved.add('welcome_to_thode');
  if (maxDayHours >= 3) achieved.add('getting_comfortable');
  if (maxLevel3DayHours >= 4) achieved.add('warm_up_session');
  if (streak >= 5) achieved.add('in_the_zone');
  if (maxDayHours >= 5) achieved.add('half_day_warrior');
  if (after11pm) achieved.add('academic_night_owl');
  if (maxLockedDayHours >= 5) achieved.add('steady_grind');
  if (streak >= 7) achieved.add('weekly_regular');
  if (maxDayHours >= 7) achieved.add('committed');
  if (weekendScholar) achieved.add('weekend_scholar');
  if (maxWeekHours >= 30) achieved.add('almost_full_time_thoder');
  if (maxDayHours >= 12) achieved.add('now_you_have_to_ace_it');
  if (maxWeekHours >= 40) achieved.add('full_time_thoder');
  if (after2am) achieved.add('night_shift');
  if (maxWeekHours >= 44) achieved.add('employee_of_the_month');
  if (villainWindow) achieved.add('villain_origin_story');
  if (streak >= 18) achieved.add('go_home_please');
  if (straight24) achieved.add('academic_victim');

  return [...achieved];
}

function mapAchievementRows(rows) {
  return rows
    .map((row) => {
      const def = ACHIEVEMENT_BY_KEY.get(row.achievement_key);
      if (!def) return null;
      return {
        key: def.key,
        tier: def.tier,
        title: def.title,
        subtitle: def.subtitle,
        month: row.month,
        unlockedAt: row.unlocked_at
      };
    })
    .filter(Boolean);
}

async function syncAchievementsForMonth(userId, month) {
  const monthLogsRes = await dbQuery(
    `SELECT date, arrival, departure, hours, productivity
     FROM time_logs
     WHERE user_id = $1 AND substr(date, 1, 7) = $2`,
    [userId, month]
  );

  const shouldHaveKeys = new Set(evaluateAchievementKeys(monthLogsRes.rows, getTodayISO()));

  const existingRes = await dbQuery(
    `SELECT achievement_key, month, unlocked_at
     FROM user_achievements
     WHERE user_id = $1 AND month = $2`,
    [userId, month]
  );
  const existingRows = existingRes.rows;
  const existingKeys = new Set(existingRows.map((r) => r.achievement_key));

  const newlyUnlocked = [];
  for (const key of shouldHaveKeys) {
    if (!existingKeys.has(key)) {
      const ins = await dbQuery(
        `INSERT INTO user_achievements (user_id, month, achievement_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, month, achievement_key) DO NOTHING
         RETURNING achievement_key, month, unlocked_at`,
        [userId, month, key]
      );
      if (ins.rowCount > 0) {
        newlyUnlocked.push(...mapAchievementRows(ins.rows));
      }
    }
  }

  const removed = [];
  for (const row of existingRows) {
    if (!shouldHaveKeys.has(row.achievement_key)) {
      await dbQuery(
        `DELETE FROM user_achievements
         WHERE user_id = $1 AND month = $2 AND achievement_key = $3`,
        [userId, month, row.achievement_key]
      );
      const def = ACHIEVEMENT_BY_KEY.get(row.achievement_key);
      if (def) {
        removed.push({
          key: def.key,
          tier: def.tier,
          title: def.title,
          subtitle: def.subtitle,
          month
        });
      }
    }
  }

  return { newlyUnlocked, removed };
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Keep a lightweight probe endpoint for uptime checks and deployment health.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, dbReady, uptimeSeconds: Math.floor(process.uptime()) });
});

// During cold starts, let static pages load while API waits for DB readiness.
app.use('/api', (req, res, next) => {
  if (dbReady) return next();
  return res.status(503).json({ error: 'Server is warming up. Please retry in a few seconds.' });
});

// API routes

// Signup
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail.endsWith(MAC_EMAIL_DOMAIN)) {
    return res
      .status(400)
      .json({ error: `You must sign up with a ${MAC_EMAIL_DOMAIN} email address.` });
  }

  try {
    const hashed = bcrypt.hashSync(password, 10);
    const result = await dbQuery(
      `INSERT INTO users (name, username, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email`,
      [cleanUsername, cleanUsername, cleanEmail, hashed]
    );
    const created = result.rows[0];
    const user = { id: created.id, username: created.username, email: created.email };
    const token = createToken(user);
    res.json({ userId: user.id, username: user.username, email: user.email, token });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to sign up.' });
  }
});

// Login (accepts email OR username)
app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email or username and password are required.' });
  }

  try {
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes('@');
    const query = isEmail
      ? 'SELECT id, username, email, password FROM users WHERE lower(email) = $1'
      : 'SELECT id, username, email, password FROM users WHERE username = $1';
    const value = isEmail ? trimmed.toLowerCase() : trimmed;
    const result = await dbQuery(query, [value]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const safeUser = {
      id: user.id,
      username: user.username || trimmed,
      email: user.email
    };
    const token = createToken(safeUser);
    res.json({
      userId: safeUser.id,
      username: safeUser.username,
      email: safeUser.email,
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in.' });
  }
});

// Add a time log
app.post('/api/logs', authMiddleware, async (req, res) => {
  const { date: rawDate, arrival, departure, productivity } = req.body || {};
  const userId = req.user && req.user.userId;
  if (!userId || !arrival || !departure || !productivity) {
    return res
      .status(400)
      .json({ error: 'userId, arrival, departure, and productivity are required.' });
  }

  const allowedProductivity = new Set([
    'Super locked',
    'Locked',
    'Studying with a side of yap',
    'Yap with a side of study',
    'Did basically nothing'
  ]);

  if (!allowedProductivity.has(productivity)) {
    return res.status(400).json({ error: 'Invalid productivity value.' });
  }

  const startMin = parseTimeToMinutes(arrival);
  const endMin = parseTimeToMinutes(departure);
  if (startMin === null || endMin === null) {
    return res.status(400).json({ error: 'Invalid time format.' });
  }

  const today = getTodayISO();
  const yesterday = getYesterdayISO();

  // Validate date: default to today, but only allow today or yesterday.
  let date = today;
  if (rawDate && typeof rawDate === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    if (rawDate !== today && rawDate !== yesterday) {
      return res.status(400).json({ error: 'You can only log hours for today or yesterday.' });
    }
    date = rawDate;
  }

  // Only enforce "time in the future" rule when logging for today.
  if (date === today) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (startMin > nowMinutes || endMin > nowMinutes) {
      return res.status(400).json({ error: 'You cannot log time in the future.' });
    }
  }

  const hours = computeHours(arrival, departure);
  if (hours === null) {
    return res.status(400).json({ error: 'Invalid times. Departure must be after arrival in HH:MM format.' });
  }

  try {
    // Prevent exact duplicate rows for the same day.
    // (Overlap checks were too strict and could falsely block valid inserts.)
    const duplicate = await dbQuery(
      `SELECT id
       FROM time_logs
       WHERE user_id = $1 AND date = $2 AND arrival = $3 AND departure = $4
       LIMIT 1`,
      [userId, date, arrival, departure]
    );
    if (duplicate.rowCount > 0) {
      return res.status(400).json({ error: 'This exact time entry already exists for that date.' });
    }

    const inserted = await dbQuery(
      `INSERT INTO time_logs (user_id, date, arrival, departure, hours, productivity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, date, arrival, departure, hours, productivity]
    );
    const month = date.slice(0, 7);
    const syncResult = await syncAchievementsForMonth(userId, month);

    res.json({
      id: inserted.rows[0].id,
      userId,
      date,
      arrival,
      departure,
      hours,
      productivity,
      newAchievements: syncResult.newlyUnlocked
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save log.' });
  }
});

// Get current month summary for a user
app.get('/api/summary', authMiddleware, async (req, res) => {
  const { userId, month } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' });
  }

  const now = new Date();
  const year = now.getFullYear();
  const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
  const currentMonth = `${year}-${monthStr}`;
  const selectedMonth = (month || currentMonth).slice(0, 7);

  try {
    await syncAchievementsForMonth(userId, selectedMonth);

    const logsRes = await dbQuery(
      `SELECT id, date, arrival, departure, hours, productivity
       FROM time_logs
       WHERE user_id = $1 AND substr(date, 1, 7) = $2
       ORDER BY date ASC, arrival ASC`,
      [userId, selectedMonth]
    );

    const totalRes = await dbQuery(
      `SELECT COALESCE(SUM(hours), 0) AS total
       FROM time_logs
       WHERE user_id = $1 AND substr(date, 1, 7) = $2`,
      [userId, selectedMonth]
    );

    const currentAchRes = await dbQuery(
      `SELECT achievement_key, month, unlocked_at
       FROM user_achievements
       WHERE user_id = $1 AND month = $2
       ORDER BY unlocked_at DESC`,
      [userId, selectedMonth]
    );

    const pastAchRes = await dbQuery(
      `SELECT achievement_key, month, unlocked_at
       FROM user_achievements
       WHERE user_id = $1 AND month <> $2
       ORDER BY month DESC, unlocked_at DESC`,
      [userId, selectedMonth]
    );

    const pastByMonth = new Map();
    for (const ach of mapAchievementRows(pastAchRes.rows)) {
      if (!pastByMonth.has(ach.month)) pastByMonth.set(ach.month, []);
      pastByMonth.get(ach.month).push(ach);
    }

    res.json({
      month: selectedMonth,
      totalHours: Number(totalRes.rows[0].total || 0),
      logs: logsRes.rows.map((r) => ({ ...r, hours: Number(r.hours) })),
      achievementsCurrentMonth: mapAchievementRows(currentAchRes.rows),
      pastAchievements: [...pastByMonth.entries()].map(([month, achievements]) => ({
        month,
        achievements
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load summary.' });
  }
});

// Get leaderboard for current month
app.get('/api/leaderboard', authMiddleware, async (req, res) => {
  const { month } = req.query;
  const now = new Date();
  const year = now.getFullYear();
  const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
  const currentMonth = `${year}-${monthStr}`;
  const selectedMonth = (month || currentMonth).slice(0, 7);

  try {
    const baseRes = await dbQuery(
      `SELECT
         t.user_id AS "userId",
         COALESCE(u.username, u.name, 'User ' || t.user_id::text) AS name,
         COALESCE(SUM(t.hours), 0) AS "totalHours",
         CASE
           WHEN SUM(
             CASE t.productivity
               WHEN 'Super locked' THEN 5 * t.hours
               WHEN 'Locked' THEN 4 * t.hours
               WHEN 'Studying with a side of yap' THEN 3 * t.hours
               WHEN 'Yap with a side of study' THEN 2 * t.hours
               WHEN 'Did basically nothing' THEN 1 * t.hours
               ELSE 0
             END
           ) = 0 OR COALESCE(SUM(t.hours), 0) = 0
             THEN NULL
           ELSE
             1.0 * SUM(
               CASE t.productivity
                 WHEN 'Super locked' THEN 5 * t.hours
                 WHEN 'Locked' THEN 4 * t.hours
                 WHEN 'Studying with a side of yap' THEN 3 * t.hours
                 WHEN 'Yap with a side of study' THEN 2 * t.hours
                 WHEN 'Did basically nothing' THEN 1 * t.hours
                 ELSE 0
               END
             ) / SUM(t.hours)
         END AS "avgProductivity"
       FROM time_logs t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE substr(t.date, 1, 7) = $1
       GROUP BY t.user_id, u.username, u.name
       ORDER BY "totalHours" DESC, name ASC`,
      [selectedMonth]
    );

    const rows = baseRes.rows.map((r) => ({
      userId: Number(r.userId),
      name: r.name,
      totalHours: Number(r.totalHours || 0),
      avgProductivity: r.avgProductivity == null ? null : Number(r.avgProductivity)
    }));

    const todayISO = getTodayISO();

    const datesRes = await dbQuery(
      `SELECT user_id, date
       FROM (
         SELECT DISTINCT user_id, date
         FROM time_logs
         WHERE substr(date, 1, 7) = $1
       ) d
       ORDER BY user_id ASC, date ASC`,
      [selectedMonth]
    );

    const datesByUser = new Map();
    for (const r of datesRes.rows) {
      const uid = Number(r.user_id);
      const d = r.date;
      if (!datesByUser.has(uid)) datesByUser.set(uid, []);
      datesByUser.get(uid).push(d);
    }

    const toDate = (iso) => new Date(iso + 'T00:00:00');

    const withStreak = rows.map((row) => {
      const dates = (datesByUser.get(row.userId) || []).filter((d) => d && d <= todayISO);
      if (dates.length === 0) return { ...row, streak: 0 };

      let streak = 1;
      let i = dates.length - 1;
      let prev = dates[i];
      while (i > 0) {
        const curr = dates[i - 1];
        const diffDays = (toDate(prev) - toDate(curr)) / (1000 * 60 * 60 * 24);
        if (diffDays === 1) {
          streak += 1;
          prev = curr;
          i -= 1;
        } else {
          break;
        }
      }

      return { ...row, streak };
    });

    res.json({ month: selectedMonth, leaderboard: withStreak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

// Delete a time log (today or yesterday only)
app.delete('/api/logs/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user && req.user.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const logRes = await dbQuery('SELECT id, user_id, date FROM time_logs WHERE id = $1', [id]);
    const log = logRes.rows[0];

    if (!log) {
      return res.status(404).json({ error: 'Log not found.' });
    }

    if (Number(log.user_id) !== Number(userId)) {
      return res.status(403).json({ error: 'You can only delete your own logs.' });
    }

    const today = getTodayISO();
    const yesterday = getYesterdayISO();
    if (log.date !== today && log.date !== yesterday) {
      return res.status(400).json({ error: 'You can only delete logs from today or yesterday.' });
    }

    await dbQuery('DELETE FROM time_logs WHERE id = $1', [id]);
    const month = String(log.date).slice(0, 7);
    const syncResult = await syncAchievementsForMonth(userId, month);
    res.json({ success: true, removedAchievements: syncResult.removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete log.' });
  }
});

// Forgot password - send reset link
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const userRes = await dbQuery(
      'SELECT id, email, username FROM users WHERE lower(email) = $1',
      [email.trim().toLowerCase()]
    );
    const user = userRes.rows[0];

    if (!user) {
      // Do not reveal whether email exists
      return res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
    await dbQuery(
      `INSERT INTO password_resets (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt.toISOString()]
    );

    const baseUrl = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
    const resetUrl = `${baseUrl}/reset.html?token=${token}`;

    await transporter.sendMail({
      to: user.email,
      from: process.env.FROM_EMAIL || 'no-reply@example.com',
      subject: 'Reset your Thode Hours password',
      text: `Hi ${user.username || ''},\n\nClick this link to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.\n`,
      html: `<p>Hi ${user.username || ''},</p>
             <p>Click this link to reset your password:</p>
             <p><a href="${resetUrl}">${resetUrl}</a></p>
             <p>If you did not request this, you can ignore this email.</p>`
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send reset email.' });
  }
});

// Reset password using token
app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required.' });
  }

  try {
    const rowRes = await dbQuery(
      `SELECT id, user_id, expires_at
       FROM password_resets
       WHERE token = $1`,
      [token]
    );
    const row = rowRes.rows[0];

    if (!row) {
      return res.status(400).json({ error: 'Invalid or expired token.' });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token has expired.' });
    }

    const hashed = bcrypt.hashSync(password, 10);
    await dbQuery('UPDATE users SET password = $1 WHERE id = $2', [hashed, row.user_id]);
    await dbQuery('DELETE FROM password_resets WHERE id = $1', [row.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Admin: delete all users who do not have a @mcmaster.ca email
// Optionally protected by ADMIN_TOKEN environment variable (sent via X-Admin-Token header)
app.delete('/api/admin/purge-non-mac-users', async (req, res) => {
  const requiredToken = process.env.ADMIN_TOKEN;
  if (requiredToken) {
    const provided = req.headers['x-admin-token'];
    if (!provided || provided !== requiredToken) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
  }

  try {
    const nonMacUsersRes = await dbQuery(
      'SELECT id FROM users WHERE lower(email) NOT LIKE $1',
      [`%${MAC_EMAIL_DOMAIN}`]
    );
    const nonMacUsers = nonMacUsersRes.rows;

    if (!nonMacUsers.length) {
      return res.json({
        deletedUsers: 0,
        deletedLogs: 0,
        deletedPasswordResets: 0
      });
    }

    const ids = nonMacUsers.map((u) => u.id);
    const logsResult = await dbQuery('DELETE FROM time_logs WHERE user_id = ANY($1::bigint[])', [
      ids
    ]);
    const resetsResult = await dbQuery(
      'DELETE FROM password_resets WHERE user_id = ANY($1::bigint[])',
      [ids]
    );
    const usersResult = await dbQuery('DELETE FROM users WHERE id = ANY($1::bigint[])', [ids]);

    res.json({
      deletedUsers: usersResult.rowCount || 0,
      deletedLogs: logsResult.rowCount || 0,
      deletedPasswordResets: resetsResult.rowCount || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to purge non-Mac users.' });
  }
});

// Admin: delete all users and related data
// Protected by the same ADMIN_TOKEN mechanism as above
app.delete('/api/admin/delete-all-users', async (req, res) => {
  const requiredToken = process.env.ADMIN_TOKEN;
  if (requiredToken) {
    const provided = req.headers['x-admin-token'];
    if (!provided || provided !== requiredToken) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
  }

  try {
    const deleteLogs = await dbQuery('DELETE FROM time_logs');
    const deleteResets = await dbQuery('DELETE FROM password_resets');
    const deleteUsers = await dbQuery('DELETE FROM users');

    res.json({
      deletedUsers: deleteUsers.rowCount || 0,
      deletedLogs: deleteLogs.rowCount || 0,
      deletedPasswordResets: deleteResets.rowCount || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete all users.' });
  }
});

// Presence: who is currently at Thode
app.get('/api/presence', authMiddleware, async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT p.user_id AS "userId",
              p.checked_in_at AS "checkedInAt",
              COALESCE(u.username, u.name) AS name
       FROM current_presence p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.checked_in_at ASC`
    );
    const userId = Number(req.user.userId);
    res.json({
      users: rows.rows.map((r) => ({
        userId: Number(r.userId),
        name: r.name,
        checkedInAt: r.checkedInAt
      })),
      isCheckedIn: rows.rows.some((r) => Number(r.userId) === userId)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load current presence.' });
  }
});

app.post('/api/presence/check-in', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.userId);
    await dbQuery(
      `INSERT INTO current_presence (user_id, checked_in_at)
       VALUES ($1, now())
       ON CONFLICT (user_id) DO UPDATE SET checked_in_at = EXCLUDED.checked_in_at`,
      [userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check in.' });
  }
});

app.delete('/api/presence/check-out', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.user.userId);
    await dbQuery('DELETE FROM current_presence WHERE user_id = $1', [userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check out.' });
  }
});

// Feedback: users can submit requests/comments.
app.post('/api/feedback', authMiddleware, async (req, res) => {
  const userId = Number(req.user?.userId);
  const message = String(req.body?.message || '').trim();
  if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
  if (!message) return res.status(400).json({ error: 'Feedback message is required.' });
  if (message.length > 2000) return res.status(400).json({ error: 'Feedback is too long (max 2000 chars).' });

  try {
    const result = await dbQuery(
      `INSERT INTO feedback_entries (user_id, message)
       VALUES ($1, $2)
       RETURNING id, created_at`,
      [userId, message]
    );
    res.json({
      ok: true,
      id: Number(result.rows[0].id),
      createdAt: result.rows[0].created_at
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

(async () => {
  try {
    await initDb();
    dbReady = true;
    console.log('Database initialized.');
    scheduleAutoCheckOut();
  } catch (err) {
    console.error('Failed to initialize database.', err);
    process.exit(1);
  }
})();

