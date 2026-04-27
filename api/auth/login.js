// api/auth/login.js
import sql from '../lib/db.js';
import bcrypt from 'bcryptjs';
import { signToken, setCookie, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, expectedRole } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
    if (!user) return res.status(401).json({ error: 'No account found with this email.' });
    if (!user.password_hash) return res.status(401).json({ error: 'This account uses social login.' });
    if (!(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Incorrect password.' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Account suspended.' });
    if (expectedRole && user.role !== expectedRole)
      return res.status(403).json({ error: `This account is a ${user.role} account. Try the ${user.role} login.` });

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    res.setHeader('Set-Cookie', setCookie(token));
    res.json({ ok: true, user: { id:user.id, name:user.name, email:user.email, role:user.role, avatar_url:user.avatar_url, handle:user.handle }, token });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}
