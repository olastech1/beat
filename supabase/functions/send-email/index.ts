import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ─────────────────────────────────────────────────────────────
//  BeatMarket — Email Notification Edge Function (SMTP)
//  Works with: Gmail, Google Workspace, Hostinger/hPanel, or
//              any standard SMTP provider
//
//  Deploy:
//    supabase functions deploy send-email
//
//  Required env vars (set in Supabase Dashboard → Edge Functions):
//
//  ── Gmail / Google Workspace ──────────────────────────────
//    SMTP_HOST = smtp.gmail.com
//    SMTP_PORT = 465
//    SMTP_USER = yourname@gmail.com  (or @yourdomain.com)
//    SMTP_PASS = xxxx xxxx xxxx xxxx  (Gmail App Password — 16 chars)
//    FROM_EMAIL = yourname@gmail.com
//    FROM_NAME  = BeatMarket
//    SITE_URL   = https://yourdomain.com
//
//  ── Hostinger / hPanel Webmail ────────────────────────────
//    SMTP_HOST = smtp.hostinger.com
//    SMTP_PORT = 465
//    SMTP_USER = noreply@yourdomain.com
//    SMTP_PASS = your-hpanel-email-password
//    FROM_EMAIL = noreply@yourdomain.com
//    FROM_NAME  = BeatMarket
//    SITE_URL   = https://yourdomain.com
// ─────────────────────────────────────────────────────────────

const SMTP_HOST  = Deno.env.get("SMTP_HOST")  ?? "";
const SMTP_PORT  = parseInt(Deno.env.get("SMTP_PORT")  ?? "465");
const SMTP_USER  = Deno.env.get("SMTP_USER")  ?? "";
const SMTP_PASS  = Deno.env.get("SMTP_PASS")  ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? SMTP_USER;
const FROM_NAME  = Deno.env.get("FROM_NAME")  ?? "BeatMarket";
const SITE_URL   = Deno.env.get("SITE_URL")   ?? "https://beatmarket.com";

// ── Base email style ─────────────────────────────────────────────────

const logoHtml = `
  <div style="margin-bottom:28px">
    <span style="font-size:28px;font-weight:900;color:#e2e2f0">🎧 Beat<span style="color:#a855f7">Market</span></span>
  </div>
`;

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:15px;margin-top:24px">${label}</a>`;

const card = (content: string) =>
  `<div style="background:#13131e;border:1px solid #1e1e3a;border-radius:12px;padding:20px;margin-bottom:20px">${content}</div>`;

const row = (label: string, value: string) =>
  `<div style="display:flex;justify-content:space-between;margin-top:8px"><span style="color:#6b7280">${label}</span><span style="font-weight:600">${value}</span></div>`;

function wrapEmail(content: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#09090f;color:#e2e2f0;padding:40px 24px;max-width:600px;margin:0 auto">
  ${logoHtml}
  ${content}
  <hr style="border:none;border-top:1px solid #1e1e3a;margin:32px 0">
  <p style="font-size:12px;color:#6b7280">
    © ${new Date().getFullYear()} BeatMarket &nbsp;·&nbsp;
    <a href="${SITE_URL}" style="color:#7c3aed">beatmarket.com</a><br>
    You received this because you have an account on BeatMarket.
  </p>
</body>
</html>`;
}

// ── Email templates ──────────────────────────────────────────────────

function buildEmail(type: string, data: Record<string, string>): { subject: string; html: string } {
  switch (type) {

    case "order_confirmation":
      return {
        subject: `✅ Order Confirmed — "${data.beatTitle}"`,
        html: wrapEmail(`
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Your purchase is confirmed! 🎉</h2>
          <p style="color:#9999bb;margin-bottom:20px">Hi ${data.buyerName}, thank you for your purchase.</p>
          ${card(`
            <div style="font-size:18px;font-weight:700">${data.beatTitle}</div>
            <div style="font-size:13px;color:#9999bb;margin-top:4px">by ${data.producerName}</div>
            <hr style="border:none;border-top:1px solid #1e1e3a;margin:16px 0">
            ${row("License", data.licenseType)}
            ${row("Amount", `<span style="color:#10b981">$${data.amount}</span>`)}
          `)}
          ${btn(`${SITE_URL}/buyer.html`, "📥 Download Your Beat")}
          <p style="color:#6b7280;font-size:13px;margin-top:20px">Access your downloads anytime from your buyer dashboard.</p>
        `),
      };

    case "new_sale":
      return {
        subject: `💰 New Sale — "${data.beatTitle}" — $${data.amount}`,
        html: wrapEmail(`
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">You just made a sale! 🚀</h2>
          <p style="color:#9999bb;margin-bottom:20px">Hi ${data.sellerName}, someone purchased your beat.</p>
          ${card(`
            <div style="font-size:18px;font-weight:700">${data.beatTitle}</div>
            <hr style="border:none;border-top:1px solid #1e1e3a;margin:16px 0">
            ${row("License sold", data.licenseType)}
            ${row("Sale amount", `<span style="color:#10b981">$${data.amount}</span>`)}
            ${row("Your earnings", `<span style="color:#a855f7">$${data.sellerEarnings}</span>`)}
          `)}
          ${btn(`${SITE_URL}/seller.html`, "📊 View Dashboard")}
        `),
      };

    case "beat_approved":
      return {
        subject: `✅ Your Beat "${data.beatTitle}" is Now Live!`,
        html: wrapEmail(`
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Your beat is live! 🎵</h2>
          <p style="color:#9999bb;margin-bottom:20px">Hi ${data.sellerName}, your beat has been approved and is now visible to buyers.</p>
          ${card(`
            <div style="font-size:18px;font-weight:700">${data.beatTitle}</div>
            <div style="font-size:13px;color:#10b981;margin-top:8px">✓ Status: Active</div>
          `)}
          ${btn(`${SITE_URL}/seller.html`, "🎵 View My Beats")}
        `),
      };

    case "beat_rejected":
      return {
        subject: `ℹ️ Beat Review Update — "${data.beatTitle}"`,
        html: wrapEmail(`
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Beat review update</h2>
          <p style="color:#9999bb;margin-bottom:20px">Hi ${data.sellerName}, we reviewed your submission.</p>
          ${card(`
            <div style="font-size:18px;font-weight:700">${data.beatTitle}</div>
            <div style="font-size:13px;color:#ef4444;margin-top:8px">✗ Not approved</div>
            ${data.note ? `<p style="color:#9999bb;font-size:14px;margin-top:12px;padding:10px;background:#09090f;border-radius:8px">${data.note}</p>` : ""}
          `)}
          <p style="color:#9999bb;font-size:14px">Review any feedback above and re-upload an updated version.</p>
          ${btn(`${SITE_URL}/seller.html`, "⬆️ Upload New Beat")}
        `),
      };

    case "payout_status": {
      const statusColor = data.status === "paid" ? "#10b981" : data.status === "approved" ? "#a855f7" : "#ef4444";
      const statusLabel = data.status === "paid" ? "💰 Paid" : data.status === "approved" ? "✅ Approved" : "❌ Rejected";
      return {
        subject: `Payout Update — ${statusLabel} — $${data.amount}`,
        html: wrapEmail(`
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Payout request update</h2>
          <p style="color:#9999bb;margin-bottom:20px">Hi ${data.sellerName}, your payout request has been updated.</p>
          ${card(`
            ${row("Amount",  `$${data.amount}`)}
            ${row("Method",   data.method)}
            ${row("Status",  `<span style="color:${statusColor};font-weight:700">${statusLabel}</span>`)}
            ${data.note ? `<div style="margin-top:12px;padding:10px;background:#09090f;border-radius:8px;font-size:13px;color:#9999bb">Note: ${data.note}</div>` : ""}
          `)}
          ${btn(`${SITE_URL}/seller.html`, "💳 View Earnings")}
        `),
      };
    }

    case "admin_payout_request":
      return {
        subject: `🔔 New Payout Request — $${data.amount} from ${data.sellerName}`,
        html: wrapEmail(`
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">New payout request needs review</h2>
          ${card(`
            ${row("Seller",  data.sellerName)}
            ${row("Amount",  `<span style="color:#10b981;font-weight:700">$${data.amount}</span>`)}
            ${row("Method",   data.method)}
            ${row("Details",  data.paymentDetails)}
          `)}
          ${btn(`${SITE_URL}/admin.html`, "💸 Review in Admin Panel")}
        `),
      };

    case "admin_beat_pending":
      return {
        subject: `🎵 New Beat Pending Review — "${data.beatTitle}" by ${data.sellerName}`,
        html: wrapEmail(`
          <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">New beat pending review</h2>
          ${card(`
            <div style="font-size:18px;font-weight:700">${data.beatTitle}</div>
            <div style="font-size:13px;color:#9999bb;margin-top:4px">by ${data.sellerName}</div>
            <hr style="border:none;border-top:1px solid #1e1e3a;margin:16px 0">
            ${row("Genre", data.genre)}
            ${row("Price", `$${data.price}`)}
          `)}
          ${btn(`${SITE_URL}/admin.html`, "🔍 Review Beat")}
        `),
      };

    default:
      return { subject: "BeatMarket Notification", html: wrapEmail("<p>You have a new notification from BeatMarket.</p>") };
  }
}

// ── SMTP send helper ─────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const msg = "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.";
    console.error(msg);
    return { ok: false, error: msg };
  }

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port:     SMTP_PORT,
      // port 465 = direct TLS/SSL  |  port 587 = STARTTLS (tls: false)
      tls:      SMTP_PORT === 465,
      auth: {
        username: SMTP_USER,
        password: SMTP_PASS,
      },
    },
  });

  try {
    await client.send({
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      to:      to,
      subject: subject,
      html:    html,
    });
    await client.close();
    return { ok: true };
  } catch (err) {
    console.error("SMTP send error:", err);
    try { await client.close(); } catch { /* ignore */ }
    return { ok: false, error: String(err) };
  }
}

// ── HTTP handler ─────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { type, to, data } = body as { type: string; to: string; data: Record<string, string> };

  if (!type || !to || !data) {
    return new Response(JSON.stringify({ error: "Missing: type, to, data" }), { status: 400 });
  }

  const { subject, html } = buildEmail(type, data as Record<string, string>);
  const result = await sendEmail(to, subject, html);

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
