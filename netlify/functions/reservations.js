// Secured data proxy.
// 1) Requires a valid login token (JWT).
// 2) For housekeeping, clamps the requested date range to the allowed window
//    (today ± the days set in policy_for_date_range) — enforced HERE on the server,
//    so it can't be bypassed by editing the page.
// 3) Then fetches from the http-only hotel API (allowed server-side) and returns it.
const { json, authUser, sql } = require('./_lib');

const API = 'http://119.2.105.142:3800/api/reservations_summary_for_mam2';

function thimphuTodayISO() {
  // server runs in UTC; Bhutan is UTC+6, no DST
  return new Date(Date.now() + 6 * 60 * 60000).toISOString().split('T')[0];
}
function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

exports.handler = async (event) => {
  const user = authUser(event);
  if (!user) return json(401, { error: 'Not logged in' });

  let { start_date, end_date } = event.queryStringParameters || {};
  if (!start_date || !end_date) {
    return json(400, { error: 'start_date and end_date are required' });
  }

  // Housekeeping can only see within the allowed window.
  if (user.role === 'housekeeping') {
    let before = 1, after = 1;
    try {
      const p = await sql`SELECT days_before, days_after FROM policy_for_date_range WHERE id = 1`;
      if (p[0]) { before = p[0].days_before; after = p[0].days_after; }
    } catch (_) { /* fall back to ±1 */ }

    const today = thimphuTodayISO();
    const minD = addDaysISO(today, -before);
    const maxD = addDaysISO(today, after);

    if (start_date < minD) start_date = minD;
    if (end_date > maxD) end_date = maxD;
    if (start_date > end_date) return json(200, []); // request fell entirely outside the window
  }

  const url = `${API}?start_date=${encodeURIComponent(start_date)}&end_date=${encodeURIComponent(end_date)}`;
  try {
    const resp = await fetch(url);
    const body = await resp.text();
    return {
      statusCode: resp.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body,
    };
  } catch (err) {
    return json(502, { error: 'Upstream API unreachable: ' + err.message });
  }
};
