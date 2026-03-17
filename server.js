const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const MAC_EMAIL_DOMAIN = '@mcmaster.ca';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const dbPath = path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS time_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    arrival TEXT NOT NULL,
    departure TEXT NOT NULL,
    hours REAL NOT NULL,
    productivity TEXT NOT NULL DEFAULT 'Super locked',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Ensure productivity column exists for older databases
try {
  db.prepare(
    "ALTER TABLE time_logs ADD COLUMN productivity TEXT NOT NULL DEFAULT 'Super locked'"
  ).run();
} catch (err) {
  // Ignore if the column already exists
}

// Ensure username column/index exist for older databases
try {
  db.prepare('ALTER TABLE users ADD COLUMN username TEXT').run();
} catch (err) {
  // ignore if exists
}
try {
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username)').run();
} catch (err) {
  // ignore
}
try {
  // For existing accounts without a username, default to their current name
  db.prepare(
    'UPDATE users SET username = name WHERE (username IS NULL OR username = "") AND name IS NOT NULL'
  ).run();
} catch (err) {
  // ignore if there are uniqueness issues; those can be fixed manually
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

// API routes

// Signup
app.post('/api/signup', (req, res) => {
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
    const stmt = db.prepare(
      'INSERT INTO users (name, username, email, password) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(cleanUsername, cleanUsername, cleanEmail, hashed);
    const user = {
      id: info.lastInsertRowid,
      username: cleanUsername,
      email: cleanEmail
    };
    const token = createToken(user);
    res.json({ userId: user.id, username: user.username, email: user.email, token });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to sign up.' });
  }
});

// Login (accepts email OR username)
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email or username and password are required.' });
  }

  try {
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes('@');
    const stmt = isEmail
      ? db.prepare('SELECT id, username, email, password FROM users WHERE lower(email) = ?')
      : db.prepare('SELECT id, username, email, password FROM users WHERE username = ?');

    const user = stmt.get(isEmail ? trimmed.toLowerCase() : trimmed);
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
app.post('/api/logs', authMiddleware, (req, res) => {
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

  // Validate date: default to today, but allow logging for past dates.
  let date = today;
  if (rawDate && typeof rawDate === 'string') {
    // Expect YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    // Do not allow dates in the future (string compare works for ISO dates)
    if (rawDate > today) {
      return res.status(400).json({ error: 'You cannot log time in the future.' });
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
    // Prevent overlapping logs for the same user and day
    const existing = db
      .prepare(
        `SELECT arrival, departure
         FROM time_logs
         WHERE user_id = ? AND date = ?`
      )
      .all(userId, date);

    for (const row of existing) {
      const s = parseTimeToMinutes(row.arrival);
      const e = parseTimeToMinutes(row.departure);
      if (s === null || e === null) continue;
      // Overlap if new start < existing end AND new end > existing start
      if (startMin < e && endMin > s) {
        return res.status(400).json({ error: 'This entry overlaps with an existing log for today.' });
      }
    }

    const stmt = db.prepare(
      `INSERT INTO time_logs (user_id, date, arrival, departure, hours, productivity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(userId, date, arrival, departure, hours, productivity);
    res.json({ id: info.lastInsertRowid, userId, date, arrival, departure, hours, productivity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save log.' });
  }
});

// Get current month summary for a user
app.get('/api/summary', authMiddleware, (req, res) => {
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
    const logsStmt = db.prepare(
      `SELECT id, date, arrival, departure, hours, productivity
       FROM time_logs
       WHERE user_id = ? AND substr(date, 1, 7) = ?
       ORDER BY date ASC, arrival ASC`
    );
    const logs = logsStmt.all(userId, selectedMonth);

    const totalStmt = db.prepare(
      `SELECT IFNULL(SUM(hours), 0) AS total
       FROM time_logs
       WHERE user_id = ? AND substr(date, 1, 7) = ?`
    );
    const { total } = totalStmt.get(userId, selectedMonth);

    res.json({ month: selectedMonth, totalHours: total, logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load summary.' });
  }
});

// Get leaderboard for current month
app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const { month } = req.query;
  const now = new Date();
  const year = now.getFullYear();
  const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
  const currentMonth = `${year}-${monthStr}`;
  const selectedMonth = (month || currentMonth).slice(0, 7);

  try {
    const stmt = db.prepare(
      `SELECT
         u.id as userId,
         COALESCE(u.username, u.name) as name,
         IFNULL(SUM(t.hours), 0) AS totalHours,
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
           ) = 0 OR IFNULL(SUM(t.hours), 0) = 0
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
         END AS avgProductivity
       FROM users u
       LEFT JOIN time_logs t
         ON u.id = t.user_id
        AND substr(t.date, 1, 7) = ?
       GROUP BY u.id, u.name
       HAVING IFNULL(SUM(t.hours), 0) > 0
       ORDER BY totalHours DESC, u.name ASC`
    );
    const rows = stmt.all(selectedMonth);
    res.json({ month: selectedMonth, leaderboard: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

// Delete a time log (same day only)
app.delete('/api/logs/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const userId = req.user && req.user.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const log = db
      .prepare('SELECT id, user_id, date FROM time_logs WHERE id = ?')
      .get(id);

    if (!log) {
      return res.status(404).json({ error: 'Log not found.' });
    }

    if (log.user_id !== Number(userId)) {
      return res.status(403).json({ error: 'You can only delete your own logs.' });
    }

    const today = getTodayISO();
    if (log.date !== today) {
      return res.status(400).json({ error: 'You can only delete logs from today.' });
    }

    db.prepare('DELETE FROM time_logs WHERE id = ?').run(id);
    res.json({ success: true });
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
    const user = db
      .prepare('SELECT id, email, username FROM users WHERE email = ?')
      .get(email.trim().toLowerCase());

    if (!user) {
      // Do not reveal whether email exists
      return res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
    db.prepare(
      `INSERT INTO password_resets (user_id, token, expires_at)
       VALUES (?, ?, ?)`
    ).run(user.id, token, expiresAt.toISOString());

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
app.post('/api/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required.' });
  }

  try {
    const row = db
      .prepare(
        `SELECT id, user_id, expires_at
         FROM password_resets
         WHERE token = ?`
      )
      .get(token);

    if (!row) {
      return res.status(400).json({ error: 'Invalid or expired token.' });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token has expired.' });
    }

    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(password, row.user_id);
    db.prepare('DELETE FROM password_resets WHERE id = ?').run(row.id);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Admin: delete all users who do not have a @mcmaster.ca email
// Optionally protected by ADMIN_TOKEN environment variable (sent via X-Admin-Token header)
app.delete('/api/admin/purge-non-mac-users', (req, res) => {
  const requiredToken = process.env.ADMIN_TOKEN;
  if (requiredToken) {
    const provided = req.headers['x-admin-token'];
    if (!provided || provided !== requiredToken) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
  }

  try {
    const nonMacUsers = db
      .prepare('SELECT id FROM users WHERE lower(email) NOT LIKE ?')
      .all(`%${MAC_EMAIL_DOMAIN}`);

    if (!nonMacUsers.length) {
      return res.json({
        deletedUsers: 0,
        deletedLogs: 0,
        deletedPasswordResets: 0
      });
    }

    const ids = nonMacUsers.map((u) => u.id);
    const placeholders = ids.map(() => '?').join(',');

    const deleteLogsStmt = db.prepare(
      `DELETE FROM time_logs WHERE user_id IN (${placeholders})`
    );
    const deleteResetsStmt = db.prepare(
      `DELETE FROM password_resets WHERE user_id IN (${placeholders})`
    );
    const deleteUsersStmt = db.prepare(
      `DELETE FROM users WHERE id IN (${placeholders})`
    );

    const logsResult = deleteLogsStmt.run(...ids);
    const resetsResult = deleteResetsStmt.run(...ids);
    const usersResult = deleteUsersStmt.run(...ids);

    res.json({
      deletedUsers: usersResult.changes || 0,
      deletedLogs: logsResult.changes || 0,
      deletedPasswordResets: resetsResult.changes || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to purge non-Mac users.' });
  }
});

// Admin: delete all users and related data
// Protected by the same ADMIN_TOKEN mechanism as above
app.delete('/api/admin/delete-all-users', (req, res) => {
  const requiredToken = process.env.ADMIN_TOKEN;
  if (requiredToken) {
    const provided = req.headers['x-admin-token'];
    if (!provided || provided !== requiredToken) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
  }

  try {
    const deleteLogs = db.prepare('DELETE FROM time_logs').run();
    const deleteResets = db.prepare('DELETE FROM password_resets').run();
    const deleteUsers = db.prepare('DELETE FROM users').run();

    res.json({
      deletedUsers: deleteUsers.changes || 0,
      deletedLogs: deleteLogs.changes || 0,
      deletedPasswordResets: deleteResets.changes || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete all users.' });
  }
});

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

