// Login: verify username + password, return a JWT carrying the user's role.
//
//   POST /.netlify/functions/login
//   body: { "username": "...", "password": "..." }
const { sql, json, checkPassword, signToken, clientInfo } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }
  const { username, password } = body;
  if (!username || !password) return json(400, { error: 'Enter username and password' });

  const MAX_TRIES = 5;
  const LOCK_MINUTES = 15;

  try {
    const rows = await sql`
      SELECT u.user_id, u.username, u.password_hash, u.failed_attempts, u.locked_until,
             s.full_name, s.role, s.is_active
      FROM users u
      JOIN staff_info s ON s.staff_id = u.staff_id
      WHERE u.username = ${username}`;

    const u = rows[0];
    if (!u || !u.is_active) {
      return json(401, { error: 'Wrong username or password' });
    }

    // account currently locked?
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      return json(429, { error: `Too many wrong attempts. Try again in about ${LOCK_MINUTES} minutes.` });
    }

    const ok = await checkPassword(password, u.password_hash);
    if (!ok) {
      const tries = (u.failed_attempts || 0) + 1;
      if (tries >= MAX_TRIES) {
        await sql`
          UPDATE users
          SET failed_attempts = 0,
              locked_until = now() + (${LOCK_MINUTES} * INTERVAL '1 minute')
          WHERE user_id = ${u.user_id}`;
        return json(429, { error: `Too many wrong attempts. Locked for ${LOCK_MINUTES} minutes.` });
      }
      await sql`UPDATE users SET failed_attempts = ${tries} WHERE user_id = ${u.user_id}`;
      return json(401, { error: `Wrong username or password (${MAX_TRIES - tries} tries left)` });
    }

    // success — clear any failed-attempt state
    await sql`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE user_id = ${u.user_id}`;

    const token = signToken({
      user_id: u.user_id,
      username: u.username,
      full_name: u.full_name,
      role: u.role,
    });

    // record the login (best-effort; never block login on a logging failure)
    const { ip, user_agent } = clientInfo(event);
    try {
      await sql`UPDATE users SET last_login = now() WHERE user_id = ${u.user_id}`;
      await sql`
        INSERT INTO access_log (user_id, username, role, action, ip, user_agent)
        VALUES (${u.user_id}, ${u.username}, ${u.role}, 'login', ${ip}, ${user_agent})`;
    } catch (_) { /* ignore logging errors */ }

    return json(200, {
      token,
      user: { username: u.username, full_name: u.full_name, role: u.role },
    });
  } catch (err) {
    return json(500, { error: 'Login failed: ' + err.message });
  }
};
