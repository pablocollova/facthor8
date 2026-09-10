// Vercel Serverless Function — handles submissions from the site's contact form.
// No dependencies: uses the platform's built-in fetch to call the Resend API directly.
//
// Required environment variable (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   — API key from https://resend.com
//
// Optional environment variables:
//   CONTACT_TO_EMAIL    — where leads are delivered (default: info@facthor8.com)
//   CONTACT_FROM_EMAIL  — verified sender address (default: Facthor8 <onboarding@resend.dev>,
//                          Resend's shared testing domain — works with no setup, but for a
//                          production "from @facthor8.com" address you must verify the
//                          facthor8.com domain in Resend and set this to
//                          "Facthor8 <info@facthor8.com>")

const TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'info@facthor8.com';
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'Facthor8 <onboarding@resend.dev>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }
  }
  body = body || {};

  // Honeypot: real users never fill this hidden field. Pretend success so bots move on.
  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const company = String(body.company || '').trim();
  const teamSize = String(body.teamSize || '').trim();
  const message = String(body.message || '').trim();

  if (!name || !email || !company) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('contact: RESEND_API_KEY is not set');
    return res.status(500).json({ ok: false, error: 'email_not_configured' });
  }

  const subject = `Nueva solicitud de diagnóstico — ${name} (${company})`;
  const html = `
    <h2>Nueva solicitud desde facthor8.com</h2>
    <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Empresa:</strong> ${escapeHtml(company)}</p>
    ${teamSize ? `<p><strong>Tamaño del equipo:</strong> ${escapeHtml(teamSize)}</p>` : ''}
    ${message ? `<p><strong>Mensaje:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
  `;

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email,
        subject,
        html
      })
    });

    if (!resendResponse.ok) {
      const detail = await resendResponse.text();
      console.error('contact: Resend API error', resendResponse.status, detail);
      return res.status(502).json({ ok: false, error: 'email_send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact: unexpected error', err);
    return res.status(500).json({ ok: false, error: 'unexpected_error' });
  }
};
