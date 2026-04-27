// api/cart/index.js — GET / POST / DELETE cart items
import sql from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT ci.*, b.title, b.cover_url, b.audio_url, b.producer_id,
             u.name AS producer_name
      FROM cart_items ci
      JOIN beats b ON ci.beat_id = b.id
      JOIN users u ON b.producer_id = u.id
      WHERE ci.user_id = ${user.id}
    `;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { beatId, price } = req.body;
    if (!beatId) return res.status(400).json({ error: 'beatId required' });
    await sql`
      INSERT INTO cart_items (user_id, beat_id, price)
      VALUES (${user.id}, ${beatId}, ${price||0})
      ON CONFLICT (user_id, beat_id) DO NOTHING
    `;
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { beatId } = req.body;
    if (!beatId) return res.status(400).json({ error: 'beatId required' });
    await sql`DELETE FROM cart_items WHERE user_id = ${user.id} AND beat_id = ${beatId}`;
    return res.json({ ok: true });
  }

  res.status(405).end();
}
