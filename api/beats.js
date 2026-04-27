// api/beats/index.js — GET all beats / POST new beat
import sql from './_lib/db.js';
import { requireAuth, cors } from './_lib/auth.js';

function mapBeat(b) {
  return {
    id: b.id, title: b.title,
    producer: b.producer_name, producerId: b.producer_id, producerHandle: b.producer_handle,
    genre: b.genre, bpm: b.bpm, key: b.key,
    price: parseFloat(b.price || 0),
    cover: b.cover_url || '/assets/covers/default.jpg',
    audio: b.audio_url, tags: b.tags || [],
    plays: b.plays || 0, likes: b.likes_count || 0,
    status: b.status, featured: b.featured, createdAt: b.created_at,
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET — list beats ──────────────────────────────────────────
  if (req.method === 'GET') {
    const { genre, search, featured, limit = '40', producer_id } = req.query;
    try {
      const rows = await sql`
        SELECT b.*, u.name AS producer_name, u.handle AS producer_handle
        FROM beats b
        JOIN users u ON b.producer_id = u.id
        WHERE b.status = 'active'
          AND (${genre && genre !== 'All' ? sql`b.genre = ${genre}` : sql`TRUE`})
          AND (${search ? sql`(b.title ILIKE ${'%'+search+'%'} OR u.name ILIKE ${'%'+search+'%'})` : sql`TRUE`})
          AND (${featured === 'true' ? sql`b.featured = TRUE` : sql`TRUE`})
          AND (${producer_id ? sql`b.producer_id = ${producer_id}::uuid` : sql`TRUE`})
        ORDER BY b.created_at DESC
        LIMIT ${parseInt(limit)}
      `;
      return res.json(rows.map(mapBeat));
    } catch (err) {
      console.error('beats GET:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — create beat or track plays ────────────────────────────────────────
  if (req.method === 'POST') {
    const action = req.query.action || req.body?.action;
    
    if (action === 'plays') {
      const { beatId } = req.body;
      if (beatId) {
        await sql`UPDATE beats SET plays = plays + 1 WHERE id = ${beatId}`;
      }
      return res.json({ ok: true });
    }

    const user = requireAuth(req, res);
    if (!user) return;
    if (!['seller','admin'].includes(user.role))
      return res.status(403).json({ error: 'Only sellers can upload beats.' });

    const { title, genre, bpm, key, price, cover_url, audio_url, tags } = req.body;
    if (!title || price === undefined)
      return res.status(400).json({ error: 'Title and price are required.' });
    try {
      const [beat] = await sql`
        INSERT INTO beats (title, producer_id, genre, bpm, key, price, cover_url, audio_url, tags, status)
        VALUES (${title}, ${user.id}, ${genre||null}, ${bpm||null}, ${key||null}, ${price},
                ${cover_url||null}, ${audio_url||null}, ${tags||[]}, 'pending')
        RETURNING *
      `;
      return res.status(201).json({ ok: true, beat: { ...beat, producer_name: user.name } });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
}
