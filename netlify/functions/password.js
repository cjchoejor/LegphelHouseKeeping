// Change a PIN.
//   POST /.netlify/functions/password
//     admin reset:  { target_user_id, new_pin }     (admin only — no old PIN needed)
//     self change:  { old_pin, new_pin }             (any logged-in user)
const { json, authUser, sql, hashPassword, checkPassword } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });

  const user = authUser(event);
  if (!user) return json(401, { error: 'Not logged in' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }

  const newPin = (body.new_pin || '').trim();
  if (!/^\d{4,6}$/.test(newPin)) return json(400, { error: 'New PIN must be 4 to 6 digits' });

  // ---- resetting someone else's PIN ----
  if (body.target_user_id) {
    if (user.role !== 'admin' && user.role !== 'gm') {
      return json(403, { error: "You can't reset other users' PINs" });
    }
    try {
      const t = await sql`
        SELECT u.username, s.role
        FROM users u JOIN staff_info s ON s.staff_id = u.staff_id
        WHERE u.user_id = ${body.target_user_id}`;
      if (!t.length) return json(404, { error: 'User not found' });

      const targetRole = t[0].role;
      // admin: anyone.  gm: housekeeping only.
      const allowed =
        user.role === 'admin' ||
        (user.role === 'gm' && targetRole === 'housekeeping');
      if (!allowed) return json(403, { error: "You're not allowed to reset this user's PIN" });

      const hash = await hashPassword(newPin);
      await sql`
        UPDATE users
        SET password_hash = ${hash}, failed_attempts = 0, locked_until = NULL
        WHERE user_id = ${body.target_user_id}`;
      try {
        await sql`
          INSERT INTO change_log (changed_by, change_type, details)
          VALUES (${user.username}, 'password_change', ${JSON.stringify({ target: t[0].username, by: 'admin_reset' })}::jsonb)`;
      } catch (_) {}
      return json(200, { ok: true });
    } catch (err) { return json(500, { error: err.message }); }
  }

  // ---- user changing their own PIN ----
  try {
    const rows = await sql`SELECT password_hash FROM users WHERE user_id = ${user.user_id}`;
    if (!rows.length) return json(404, { error: 'User not found' });
    if (!(await checkPassword(body.old_pin || '', rows[0].password_hash))) {
      return json(401, { error: 'Current PIN is wrong' });
    }
    const hash = await hashPassword(newPin);
    await sql`UPDATE users SET password_hash = ${hash} WHERE user_id = ${user.user_id}`;
    try {
      await sql`
        INSERT INTO change_log (changed_by, change_type, details)
        VALUES (${user.username}, 'password_change', ${JSON.stringify({ target: user.username, by: 'self' })}::jsonb)`;
    } catch (_) {}
    return json(200, { ok: true });
  } catch (err) { return json(500, { error: err.message }); }
};
