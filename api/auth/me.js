// api/auth/me.js — return current user
import sql from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    const [profile] = await sql`
      SELECT id, name, email, role, handle, avatar_url, genre, bio, status
      FROM users WHERE id = ${user.id}
    `;
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
