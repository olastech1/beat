// api/admin/beats.js — admin beat management
import sql from '../lib/db.js';
import { requireRole, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const admin = requireRole(req, res, 'admin');
  if (!admin) return;

  // GET — all beats (including pending)
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT b.*, u.name AS producer_name, u.email AS producer_email
      FROM beats b JOIN users u ON b.producer_id = u.id
      ORDER BY b.created_at DESC
    `;
    return res.json(rows);
  }

  // PUT — update beat status/featured
  if (req.method === 'PUT') {
    const { id, status, featured } = req.body;
    if (!id) return res.status(400).json({ error: 'Beat id required' });
    const [beat] = await sql`
      UPDATE beats SET
        status   = COALESCE(${status||null}, status),
        featured = COALESCE(${featured??null}, featured)
      WHERE id = ${id} RETURNING *
    `;
    return res.json({ ok: true, beat });
  }

  // DELETE — remove beat
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Beat id required' });
    await sql`DELETE FROM beats WHERE id = ${id}`;
    return res.json({ ok: true });
  }

  res.status(405).end();
}
