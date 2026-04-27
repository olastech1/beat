
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

  if (action === 'orders') {
    const rows = await sql`
      SELECT o.*, b.title as beat_title, bu.name as buyer_name, pu.name as producer_name
      FROM orders o
      LEFT JOIN beats b ON o.beat_id = b.id
      LEFT JOIN users bu ON o.buyer_id = bu.id
      LEFT JOIN users pu ON o.producer_id = pu.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `;
    const formatted = rows.map(r => ({
      id: r.id,
      amount: r.amount,
      license_type: r.license_type,
      status: r.status,
      created_at: r.created_at,
      beats: { title: r.beat_title },
      buyer: { name: r.buyer_name },
      producer: { name: r.producer_name }
    }));
    return res.json(formatted);
  }

  if (action === 'payouts') {
    if (req.method === 'GET') {
      const filter = req.query.filter || 'all';
      // Check if payouts table exists, if not return empty
      try {
        const rows = filter === 'all'
          ? await sql`SELECT p.*, u.name as seller_name, u.email as seller_email FROM payouts p LEFT JOIN users u ON p.seller_id = u.id ORDER BY p.created_at DESC LIMIT 100`
          : await sql`SELECT p.*, u.name as seller_name, u.email as seller_email FROM payouts p LEFT JOIN users u ON p.seller_id = u.id WHERE p.status = ${filter} ORDER BY p.created_at DESC LIMIT 100`;
        return res.json(rows);
      } catch (e) {
        // payouts table might not exist yet
        return res.json([]);
      }
    }
    if (req.method === 'PUT') {
      const { id, status, note } = req.body;
      try {
        const [payout] = await sql`UPDATE payouts SET status = ${status}, admin_note = ${note||null}, reviewed_at = NOW() WHERE id = ${id} RETURNING *`;
        return res.json({ ok: true, payout });
      } catch (e) {
        return res.json({ ok: false, error: e.message });
      }
    }
  }

  if (action === 'pages') {
    if (req.method === 'GET') {
      const slug = req.query.slug;
      try {
        const [page] = await sql`SELECT * FROM site_pages WHERE slug = ${slug} LIMIT 1`;
        return res.json(page || null);
      } catch {
        return res.json(null);
      }
    }
    if (req.method === 'POST') {
      const { slug, title, tag, subtitle, content, copyright } = req.body;
      try {
        const [page] = await sql`
          INSERT INTO site_pages (slug, title, tag, subtitle, content, copyright, updated_at)
          VALUES (${slug}, ${title}, ${tag}, ${subtitle}, ${content}, ${copyright}, NOW())
          ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, tag=EXCLUDED.tag, subtitle=EXCLUDED.subtitle,
            content=EXCLUDED.content, copyright=EXCLUDED.copyright, updated_at=NOW()
          RETURNING *
        `;
        return res.json({ ok: true, page });
      } catch (e) {
        return res.json({ ok: false, error: e.message });
      }
    }
  }

  res.status(404).json({ error: 'Unknown action' });
}
