// api/orders/index.js — POST create order / GET buyer's orders
import sql from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;

  // ── GET — buyer's orders ──────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT o.*, b.title AS beat_title, b.cover_url, b.audio_url
        FROM orders o
        JOIN beats b ON o.beat_id = b.id
        WHERE o.buyer_id = ${user.id}
        ORDER BY o.created_at DESC
      `;
      return res.json(rows);
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── POST — create order ───────────────────────────────────────
  if (req.method === 'POST') {
    const { beatId, amount, producerId, licenseType = 'standard', stripeSessionId } = req.body;
    if (!beatId || amount === undefined)
      return res.status(400).json({ error: 'beatId and amount required.' });

    // Resolve producer if not provided
    let pid = producerId;
    if (!pid) {
      const [b] = await sql`SELECT producer_id FROM beats WHERE id = ${beatId} LIMIT 1`;
      pid = b?.producer_id;
    }
    if (!pid) return res.status(400).json({ error: 'Could not resolve producer.' });

    try {
      // Upsert buyer profile (safety net)
      await sql`
        INSERT INTO users (id, name, email, role, password_hash)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, '')
        ON CONFLICT (id) DO NOTHING
      `;
      const [order] = await sql`
        INSERT INTO orders (buyer_id, beat_id, producer_id, amount, license_type, status, stripe_session_id)
        VALUES (${user.id}, ${beatId}, ${pid}, ${amount}, ${licenseType}, 'completed', ${stripeSessionId||null})
        RETURNING *
      `;
      return res.status(201).json({ ok: true, order });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  res.status(405).end();
}
