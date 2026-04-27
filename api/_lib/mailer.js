import { Resend } from 'resend';

// Initialize Resend
// In dev, if RESEND_API_KEY is not set, it will mock the sending (return success without sending).
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = 'onboarding@resend.dev'; // Replace with your verified domain email (e.g. support@beatmarket.com)

export async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.log('--- MOCK EMAIL SENT ---');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('HTML:', html);
    console.log('-----------------------');
    return { ok: true, mocked: true };
  }

  try {
    const data = await resend.emails.send({
      from: `BeatMarket <${FROM_EMAIL}>`,
      to,
      subject,
      html
    });
    return { ok: true, data };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { ok: false, error };
  }
}
