// api/checkout.js — Stripe Checkout session
import Stripe from 'stripe';
import sql from './lib/db.js';
import { requireAuth, cors } from './lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk || sk.includes('YOUR_')) {
    // No Stripe — fall through to direct order creation on frontend
    return res.json({ demo: true, message: 'Stripe not configured' });
  }

  const { items, success_url, cancel_url } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Cart is empty' });

  try {
    const stripe = new Stripe(sk, { apiVersion: '2024-06-20' });
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(item.amount * 100),
        product_data: { name: item.name, metadata: { beat_id: item.beat_id || '' } },
      },
      quantity: 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: user.email,
      success_url: (success_url || `${req.headers.origin}/buyer.html?payment=success`) + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:   cancel_url  || `${req.headers.origin}${req.headers.referer || '/'}?payment=cancelled`,
      metadata: { buyer_id: user.id, source: 'beatmarket' },
    });

    res.json({ ok: true, url: session.url, session_id: session.id });
  } catch (err) {
    console.error('checkout:', err);
    res.status(400).json({ error: err.message });
  }
}
