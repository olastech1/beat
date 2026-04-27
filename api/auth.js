
import sql from './_lib/db.js';
import bcrypt from 'bcryptjs';
import { signToken, verifyToken, setCookie, clearCookie, cors, requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || req.body?.action;

  if (action === 'register') {
    const { name, email, password, role = 'buyer', handle, genre } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    try {
      const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
      if (existing.length) return res.status(400).json({ error: 'Email already registered.' });
      const hash = await bcrypt.hash(password, 10);
      const [user] = await sql`
        INSERT INTO users (name, email, password_hash, role, handle, genre, status)
        VALUES (${name}, ${email.toLowerCase()}, ${hash}, ${role}, ${handle||null}, ${genre||null}, 'active')
        RETURNING id, name, email, role, handle, avatar_url
      `;
      const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
      res.setHeader('Set-Cookie', setCookie(token));
      return res.json({ ok: true, user, token });
    } catch (err) { return res.status(500).json({ error: 'Registration failed' }); }
  }

  if (action === 'login') {
    const { email, password, expectedRole } = req.body;
    try {
      const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
      if (!user) return res.status(401).json({ error: 'No account found with this email.' });
      if (!user.password_hash) return res.status(401).json({ error: 'This account uses social login.' });
      if (!(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect password.' });
      if (user.status === 'banned') return res.status(403).json({ error: 'Account suspended.' });
      if (expectedRole && user.role !== expectedRole) return res.status(403).json({ error: `This account is a ${user.role} account.` });
      
      const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
      res.setHeader('Set-Cookie', setCookie(token));
      return res.json({ ok: true, user: { id:user.id, name:user.name, email:user.email, role:user.role, avatar_url:user.avatar_url, handle:user.handle }, token });
    } catch (err) { return res.status(500).json({ error: 'Login failed' }); }
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearCookie());
    return res.json({ ok: true });
  }

  if (action === 'me') {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const [profile] = await sql`SELECT id, name, email, role, handle, avatar_url, genre, bio, status FROM users WHERE id = ${user.id}`;
      if (!profile) return res.status(404).json({ error: 'User not found' });
      return res.json({ ok: true, user: profile });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  res.status(404).json({ error: 'Unknown action' });
}
