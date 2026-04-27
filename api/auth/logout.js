// api/auth/logout.js
import { clearCookie, cors } from '../lib/auth.js';

export default function handler(req, res) {
  cors(res);
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
}
