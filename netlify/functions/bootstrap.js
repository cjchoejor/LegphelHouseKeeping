// One-time setup: creates the FIRST admin account.
// Only works while the users table is empty, and only with the correct setup token.
// Call once after the schema is created, then it permanently refuses.
//
//   POST /.netlify/functions/bootstrap
//   header:  x-setup-token: <SETUP_TOKEN env var>
//   body:    { "username": "...", "password": "...", "full_name": "..." }
const { sql, json, hashPassword } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });

  const token = (event.headers['x-setup-token'] || event.headers['X-Setup-Token'] || '');
  if (!process.env.SETUP_TOKEN || token !== process.env.SETUP_TOKEN) {
    return json(403, { error: 'Invalid setup token' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }
  const { username, password, full_name } = body;
  if (!username || !password || !full_name) {
    return json(400, { error: 'username, password and full_name are required' });
  }

  try {
    const existing = await sql`SELECT COUNT(*)::int AS n FROM users`;
    if (existing[0].n > 0) {
      return json(403, { error: 'Already set up — an account exists. Use the Admin Console to add users.' });
    }

    const hash = await hashPassword(password);
    const staff = await sql`
      INSERT INTO staff_info (full_name, role, is_active)
      VALUES (${full_name}, 'admin', true)
      RETURNING staff_id`;
    await sql`
      INSERT INTO users (staff_id, username, password_hash)
      VALUES (${staff[0].staff_id}, ${username}, ${hash})`;

    return json(200, { ok: true, message: 'Admin account created. You can now log in.' });
  } catch (err) {
    return json(500, { error: 'Setup failed: ' + err.message });
  }
};
