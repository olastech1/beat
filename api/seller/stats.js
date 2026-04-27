// api/seller/stats.js
import sql from '../lib/db.js';
import { requireRole, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireRole(req, res, 'seller', 'admin');
  if (!user) return;

  const [[beats], [revenue], orders] = await Promise.all([
    sql`SELECT COUNT(*) AS count FROM beats WHERE producer_id = ${user.id} AND status = 'active'`,
    sql`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE producer_id = ${user.id}`,
    sql`
      SELECT o.*, b.title AS beat_title, u.name AS buyer_name
      FROM orders o
      JOIN beats b ON o.beat_id = b.id
      JOIN users u ON o.buyer_id = u.id
      WHERE o.producer_id = ${user.id}
      ORDER BY o.created_at DESC LIMIT 20
    `,
  ]);

  res.json({
    beats:   parseInt(beats.count),
    revenue: parseFloat(revenue.total),
    sales:   orders.length,
    orders,
  });
}
