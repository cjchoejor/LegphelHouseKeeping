// Lightweight ping to wake the (free-tier) Neon database from sleep.
// Called in the background when the login screen appears, so the database is
// awake by the time the user submits their PIN. No auth — it only runs SELECT 1.
const { sql, json } = require('./_lib');

exports.handler = async () => {
  try {
    await sql`SELECT 1`;
    return json(200, { ok: true });
  } catch (_) {
    return json(200, { ok: false });
  }
};
