
import sql from './_lib/db.js';
import { requireRole, cors } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const admin = requireRole(req, res, 'admin');
  if (!admin) return;

  const action = req.query.action || req.body?.action;

  if (action === 'stats') {
    const [[users], [beats], [orders], [revenue]] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM users`,
      sql`SELECT COUNT(*) AS count FROM beats WHERE status = 'active'`,
      sql`SELECT COUNT(*) AS count FROM orders`,
      sql`SELECT COALESCE(SUM(amount),0) AS total FROM orders WHERE status = 'completed'`,
    ]);
    return res.json({ users: parseInt(users.count), beats: parseInt(beats.count), orders: parseInt(orders.count), revenue: parseFloat(revenue.total) });
  }

  if (action === 'beats') {
    if (req.method === 'GET') {
      const rows = await sql`SELECT b.*, u.name AS producer_name, u.email AS producer_email FROM beats b JOIN users u ON b.producer_id = u.id ORDER BY b.created_at DESC`;
      return res.json(rows);
    }
    if (req.method === 'PUT') {
      const { id, status, featured } = req.body;
      const [beat] = await sql`UPDATE beats SET status = COALESCE(${status||null}, status), featured = COALESCE(${featured??null}, featured) WHERE id = ${id} RETURNING *`;
      return res.json({ ok: true, beat });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`DELETE FROM beats WHERE id = ${id}`;
      return res.json({ ok: true });
    }
  }

  if (action === 'users') {
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, name, email, role, status, created_at, handle FROM users ORDER BY created_at DESC`;
      return res.json(rows);
    }
    if (req.method === 'PUT') {
      const { id, status } = req.body;
      const [user] = await sql`UPDATE users SET status = ${status} WHERE id = ${id} RETURNING *`;
      return res.json({ ok: true, user });
    }
  }

  res.status(404).json({ error: 'Unknown action' });
}
