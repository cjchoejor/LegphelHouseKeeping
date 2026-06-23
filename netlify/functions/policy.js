// Read / update the housekeeping date-range policy.
//   GET  /.netlify/functions/policy        -> current policy (gm, admin)
//   POST /.netlify/functions/policy         -> update (admin only), body { days_before, days_after }
const { json, authUser, sql } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const user = authUser(event, ['admin', 'gm']);
    if (!user) return json(403, { error: 'Not allowed' });
    try {
      const p = await sql`SELECT days_before, days_after, updated_by, updated_at FROM policy_for_date_range WHERE id = 1`;
      return json(200, p[0] || { days_before: 1, days_after: 1 });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === 'POST') {
    const user = authUser(event, ['admin', 'gm']);
    if (!user) return json(403, { error: 'Not allowed to change this' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }
    const days_before = parseInt(body.days_before, 10);
    const days_after = parseInt(body.days_after, 10);
    if (!Number.isInteger(days_before) || !Number.isInteger(days_after) ||
        days_before < 0 || days_before > 60 || days_after < 0 || days_after > 60) {
      return json(400, { error: 'Enter whole numbers between 0 and 60' });
    }

    try {
      const old = await sql`SELECT days_before, days_after FROM policy_for_date_range WHERE id = 1`;
      await sql`
        UPDATE policy_for_date_range
        SET days_before = ${days_before}, days_after = ${days_after},
            updated_by = ${user.username}, updated_at = now()
        WHERE id = 1`;
      try {
        await sql`
          INSERT INTO change_log (changed_by, change_type, details)
          VALUES (${user.username}, 'policy_update',
                  ${JSON.stringify({ old: old[0] || null, new: { days_before, days_after } })}::jsonb)`;
      } catch (_) { /* logging is best-effort */ }
      return json(200, { ok: true, days_before, days_after });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
