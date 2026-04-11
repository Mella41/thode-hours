/**
 * Set a user's password directly in Postgres (no email).
 * Uses the same bcrypt settings as server.js (10 rounds).
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL = "postgresql://..."
 *   node scripts/set-password.js marshall "TheirNewPassword"
 *
 * Or by email:
 *   node scripts/set-password.js johnm23@mcmaster.ca "TheirNewPassword"
 */

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Copy it from Render (or your host) and set it in this shell.');
  process.exit(1);
}

const identifier = process.argv[2];
const newPassword = process.argv[3];

if (!identifier || !newPassword) {
  console.error('Usage: node scripts/set-password.js <username-or-email> <new-password>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const hash = bcrypt.hashSync(newPassword, 10);
  const isEmail = identifier.includes('@');
  const sql = isEmail
    ? 'UPDATE users SET password = $1 WHERE lower(email) = lower($2) RETURNING id, username, email'
    : 'UPDATE users SET password = $1 WHERE username = $2 RETURNING id, username, email';
  const res = await pool.query(sql, [hash, identifier]);
  if (res.rowCount === 0) {
    console.error('No user matched. Check username spelling or email.');
    process.exit(1);
  }
  console.log('Password updated for:', res.rows[0]);
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
