// Shared helpers for all Netlify functions: DB, JWT, password hashing, responses, auth guard.
const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Neon's HTTP driver — ideal for serverless (no pooled connections to leak).
// Usage: const rows = await sql`SELECT ... WHERE x = ${value}`;  (values are parameterised, safe)
const sql = neon(process.env.DATABASE_URL);

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_dev_only';
const TOKEN_TTL = '12h'; // staff re-login about once a shift

// ---- JSON response helper ----
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

// ---- passwords ----
async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
async function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ---- tokens ----
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function getBearer(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Returns the decoded user if the request is authenticated and (optionally) has an allowed role.
// Otherwise returns null — the caller should respond 401/403.
function authUser(event, allowedRoles) {
  const token = getBearer(event);
  if (!token) return null;
  const user = verifyToken(token);
  if (!user) return null;
  if (allowedRoles && allowedRoles.length && !allowedRoles.includes(user.role)) return null;
  return user;
}

// ---- request context (for logging) ----
function clientInfo(event) {
  const h = event.headers || {};
  return {
    ip: h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || null,
    user_agent: h['user-agent'] || null,
  };
}

module.exports = {
  sql,
  json,
  hashPassword,
  checkPassword,
  signToken,
  verifyToken,
  getBearer,
  authUser,
  clientInfo,
};
