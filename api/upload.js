// api/upload.js — file upload to Vercel Blob
import { put } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const filename = req.query.filename;
  if (!filename) return res.status(400).json({ error: 'filename query param required' });

  try {
    const blob = await put(filename, req, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    res.json({ ok: true, url: blob.url });
  } catch (err) {
    console.error('upload:', err);
    res.status(500).json({ error: err.message });
  }
}
