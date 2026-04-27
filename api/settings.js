// api/settings/index.js
import sql from './_lib/db.js';
import { requireRole, cors } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
      const [setting] = await sql`SELECT value FROM site_settings WHERE key = ${key}`;
      return res.json({ value: setting ? setting.value : null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Only admin can save settings
  if (req.method === 'POST') {
    const admin = requireRole(req, res, 'admin');
    if (!admin) return;
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
      await sql`
        INSERT INTO site_settings (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}
