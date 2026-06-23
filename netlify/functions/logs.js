// Activity logs for the admin console (admin only).
//   GET /.netlify/functions/logs  -> { access: [...recent logins], changes: [...recent changes] }
const { json, authUser, sql } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Use GET' });
  const user = authUser(event, ['admin', 'gm']);
  if (!user) return json(403, { error: 'Not allowed' });

  try {
    const access = await sql`
      SELECT username, role, action, ip, at
      FROM access_log
      ORDER BY at DESC
      LIMIT 100`;
    const changes = await sql`
      SELECT changed_by, change_type, details, changed_at
      FROM change_log
      ORDER BY changed_at DESC
      LIMIT 100`;
    return json(200, { access, changes });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
