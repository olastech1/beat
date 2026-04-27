// api/lib/auth.js — JWT helpers
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const COOKIE  = 'bm_token';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  try { return jwt.verify(token, SECRET); }
  catch { return null; }
}

export function getToken(req) {
  // 1. HttpOnly cookie
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';')
      .filter(Boolean)
      .map(c => c.trim().split('=').map(s => decodeURIComponent(s.trim())))
  );
  if (cookies[COOKIE]) return cookies[COOKIE];
  // 2. Authorization header (for clients that can't use cookies)
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function requireAuth(req, res) {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  const user = verifyToken(token);
  if (!user)  { res.status(401).json({ error: 'Invalid or expired session' }); return null; }
  return user;
}

export function requireRole(req, res, ...roles) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    res.status(403).json({ error: 'Access denied' }); return null;
  }
  return user;
}

export function setCookie(token) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${7*24*3600}; Path=/`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`;
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
