// Serverless proxy.
// The hotel API is http:// only. A page served over https:// (which Netlify always is)
// is not allowed by the browser to call an http:// address ("mixed content").
// This function runs on Netlify's SERVER, where calling http:// is fine, then hands
// the data back to the page over https://. It also sidesteps any CORS restriction.

const API = 'http://119.2.105.142:3800/api/reservations_summary_for_mam';

exports.handler = async (event) => {
  const { start_date, end_date } = event.queryStringParameters || {};

  if (!start_date || !end_date) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'start_date and end_date are required' }),
    };
  }

  const url = `${API}?start_date=${encodeURIComponent(start_date)}&end_date=${encodeURIComponent(end_date)}`;

  try {
    const resp = await fetch(url); // global fetch (Netlify runs Node 18+)
    const body = await resp.text();
    return {
      statusCode: resp.status,
      headers: {
        'content-type': 'application/json',
        // small cache so repeated opens within a minute are instant
        'cache-control': 'public, max-age=60',
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Upstream API unreachable: ' + err.message }),
    };
  }
};
