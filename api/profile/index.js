// api/profile/index.js — GET / PUT current user profile
import sql from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const [profile] = await sql`
      SELECT id, name, email, role, handle, avatar_url, genre, bio, status, created_at
      FROM users WHERE id = ${user.id}
    `;
    // Stats
    const [{ count: beatsOwned }] = await sql`SELECT COUNT(*) FROM orders WHERE buyer_id = ${user.id}`;
    const [{ sum: totalSpent }]   = await sql`SELECT COALESCE(SUM(amount),0) AS sum FROM orders WHERE buyer_id = ${user.id}`;
    const [{ count: likesCount }] = await sql`SELECT COUNT(*) FROM likes WHERE user_id = ${user.id}`;
    return res.json({ ...profile, beatsOwned: parseInt(beatsOwned), totalSpent: parseFloat(totalSpent), likesCount: parseInt(likesCount) });
  }

  if (req.method === 'PUT') {
    const { name, handle, genre, bio, avatar_url } = req.body;
    const [updated] = await sql`
      UPDATE users SET
        name       = COALESCE(${name||null}, name),
        handle     = COALESCE(${handle||null}, handle),
        genre      = COALESCE(${genre||null}, genre),
        bio        = COALESCE(${bio||null}, bio),
        avatar_url = COALESCE(${avatar_url||null}, avatar_url)
      WHERE id = ${user.id}
      RETURNING id, name, email, role, handle, avatar_url, genre, bio
    `;
    return res.json({ ok: true, user: updated });
  }

  res.status(405).end();
}
