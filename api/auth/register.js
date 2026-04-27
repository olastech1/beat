// api/auth/register.js
import sql from '../lib/db.js';
import bcrypt from 'bcryptjs';
import { signToken, setCookie, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, password, role = 'buyer', handle, genre } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

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
    res.json({ ok: true, user, token });
  } catch (err) {
    console.error('register:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}
