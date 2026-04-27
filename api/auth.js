
import sql from './_lib/db.js';
import bcrypt from 'bcryptjs';
import { signToken, verifyToken, setCookie, clearCookie, cors, requireAuth } from './_lib/auth.js';
import crypto from 'crypto';
import { sendEmail } from './_lib/mailer.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || req.body?.action;

  if (action === 'register') {
    const { name, email, password, role = 'buyer', handle, genre } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    try {
      const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
      if (existing.length) return res.status(400).json({ error: 'Email already registered.' });
      const hash = await bcrypt.hash(password, 10);
      const [user] = await sql`
        INSERT INTO users (name, email, password_hash, role, handle, genre, status)
        VALUES (${name}, ${email.toLowerCase()}, ${hash}, ${role}, ${handle||null}, ${genre||null}, 'active')
        RETURNING id, name, email, role, handle, avatar_url
      `;
      const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
      res.setHeader('Set-Cookie', setCookie(token));
      return res.json({ ok: true, user, token });
    } catch (err) { return res.status(500).json({ error: 'Registration failed' }); }
  }

  if (action === 'login') {
    const { email, password, expectedRole } = req.body;
    try {
      const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
      if (!user) return res.status(401).json({ error: 'No account found with this email.' });
      if (!user.password_hash) return res.status(401).json({ error: 'This account uses social login.' });
      if (!(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect password.' });
      if (user.status === 'banned') return res.status(403).json({ error: 'Account suspended.' });
      if (expectedRole && user.role !== expectedRole) return res.status(403).json({ error: `This account is a ${user.role} account.` });
      
      const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
      res.setHeader('Set-Cookie', setCookie(token));
      return res.json({ ok: true, user: { id:user.id, name:user.name, email:user.email, role:user.role, avatar_url:user.avatar_url, handle:user.handle }, token });
    } catch (err) { return res.status(500).json({ error: 'Login failed' }); }
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearCookie());
    return res.json({ ok: true });
  }

  if (action === 'me') {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const [profile] = await sql`SELECT id, name, email, role, handle, avatar_url, genre, bio, status FROM users WHERE id = ${user.id}`;
      if (!profile) return res.status(404).json({ error: 'User not found' });
      return res.json({ ok: true, user: profile });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (action === 'reset-password') {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
      const [user] = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
      if (!user) return res.json({ ok: true }); // pretend it sent
      
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

      await sql`UPDATE users SET reset_token = ${hash}, reset_token_expires = ${expires} WHERE id = ${user.id}`;
      
      const resetLink = `${req.headers.origin || 'http://localhost:3000'}/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;
      await sendEmail({
        to: email,
        subject: 'BeatMarket Password Reset',
        html: `<p>You requested a password reset. Click the link below to set a new password:</p>
               <p><a href="${resetLink}">Reset Password</a></p>
               <p>If you didn't request this, ignore this email.</p>`
      });
      return res.json({ ok: true });
    } catch (err) { return res.status(500).json({ error: 'Failed to send reset email' }); }
  }

  if (action === 'update-password') {
    const { email, token, password } = req.body;
    if (!email || !token || !password) return res.status(400).json({ error: 'Missing fields' });
    try {
      const [user] = await sql`SELECT id, reset_token, reset_token_expires FROM users WHERE email = ${email.toLowerCase()}`;
      if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
      
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      if (user.reset_token !== hash || new Date(user.reset_token_expires) < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }

      const pwHash = await bcrypt.hash(password, 10);
      await sql`UPDATE users SET password_hash = ${pwHash}, reset_token = NULL, reset_token_expires = NULL WHERE id = ${user.id}`;
      return res.json({ ok: true });
    } catch (err) { return res.status(500).json({ error: 'Failed to update password' }); }
  }

  res.status(404).json({ error: 'Unknown action' });
}
