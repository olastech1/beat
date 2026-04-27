// api/admin/stats.js
import sql from '../lib/db.js';
import { requireRole, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireRole(req, res, 'admin')) return;

  const [[users], [beats], [orders], [revenue]] = await Promise.all([
    sql`SELECT COUNT(*) AS count FROM users`,
    sql`SELECT COUNT(*) AS count FROM beats WHERE status = 'active'`,
    sql`SELECT COUNT(*) AS count FROM orders`,
    sql`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE status = 'completed'`,
  ]);

  res.json({
    users:   parseInt(users.count),
    beats:   parseInt(beats.count),
    orders:  parseInt(orders.count),
    revenue: parseFloat(revenue.total),
  });
}
