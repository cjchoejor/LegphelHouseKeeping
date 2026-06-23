// Staff account management.
//   GET    /.netlify/functions/users            -> list users (admin, gm)
//   POST   /.netlify/functions/users            -> create user (admin), body { full_name, username, role, pin, phone?, email? }
//   DELETE /.netlify/functions/users?user_id=N  -> remove user (admin)
const { json, authUser, sql, hashPassword } = require('./_lib');

const ROLES = ['housekeeping', 'gm', 'admin'];

exports.handler = async (event) => {
  const method = event.httpMethod;

  // ---- list ----
  if (method === 'GET') {
    const user = authUser(event, ['admin', 'gm']);
    if (!user) return json(403, { error: 'Not allowed' });
    try {
      const rows = await sql`
        SELECT u.user_id, u.username, u.last_login,
               s.full_name, s.role, s.is_active
        FROM users u
        JOIN staff_info s ON s.staff_id = u.staff_id
        ORDER BY s.role, s.full_name`;
      return json(200, rows);
    } catch (err) { return json(500, { error: err.message }); }
  }

  // ---- create ----
  if (method === 'POST') {
    const user = authUser(event, ['admin']);
    if (!user) return json(403, { error: 'Only an admin can add users' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }
    const full_name = (body.full_name || '').trim();
    const username = (body.username || '').trim();
    const role = body.role;
    const pin = (body.pin || '').trim();

    if (!full_name || !username || !pin) return json(400, { error: 'Name, username and PIN are required' });
    if (!ROLES.includes(role)) return json(400, { error: 'Pick a valid role' });
    if (!/^\d{4,6}$/.test(pin)) return json(400, { error: 'PIN must be 4 to 6 digits' });

    try {
      const taken = await sql`SELECT 1 FROM users WHERE username = ${username}`;
      if (taken.length) return json(409, { error: 'That username is already taken' });

      const hash = await hashPassword(pin);
      const staff = await sql`
        INSERT INTO staff_info (full_name, phone, email, role, is_active)
        VALUES (${full_name}, ${body.phone || null}, ${body.email || null}, ${role}, true)
        RETURNING staff_id`;
      await sql`
        INSERT INTO users (staff_id, username, password_hash)
        VALUES (${staff[0].staff_id}, ${username}, ${hash})`;
      try {
        await sql`
          INSERT INTO change_log (changed_by, change_type, details)
          VALUES (${user.username}, 'user_create', ${JSON.stringify({ username, role, full_name })}::jsonb)`;
      } catch (_) {}
      return json(200, { ok: true });
    } catch (err) { return json(500, { error: err.message }); }
  }

  // ---- delete ----
  if (method === 'DELETE') {
    const user = authUser(event, ['admin']);
    if (!user) return json(403, { error: 'Only an admin can remove users' });
    const id = (event.queryStringParameters || {}).user_id;
    if (!id) return json(400, { error: 'user_id is required' });

    try {
      const target = await sql`
        SELECT u.username, u.staff_id, s.role
        FROM users u JOIN staff_info s ON s.staff_id = u.staff_id
        WHERE u.user_id = ${id}`;
      if (!target.length) return json(404, { error: 'User not found' });
      if (target[0].username === user.username) return json(400, { error: "You can't delete your own account" });
      if (target[0].role === 'admin') return json(403, { error: "Admin accounts can't be removed here" });

      // deleting the staff row cascades to the users row (FK ON DELETE CASCADE)
      await sql`DELETE FROM staff_info WHERE staff_id = ${target[0].staff_id}`;
      try {
        await sql`
          INSERT INTO change_log (changed_by, change_type, details)
          VALUES (${user.username}, 'user_delete', ${JSON.stringify({ username: target[0].username })}::jsonb)`;
      } catch (_) {}
      return json(200, { ok: true });
    } catch (err) { return json(500, { error: err.message }); }
  }

  return json(405, { error: 'Method not allowed' });
};
