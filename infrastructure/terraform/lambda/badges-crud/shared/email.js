// Shared email helper for AWS User Group Madurai Lambdas.
//
// Two layers:
//   1. sendEmail()   - thin wrapper over SES SendEmail. Never throws; logs and
//                      returns { ok: boolean } so a mail failure can't break the
//                      caller's main flow (point awards, etc.).
//   2. renderEmail() - wraps body content in a consistent branded HTML layout
//                      with an optional call-to-action button.
//
// This file is the master copy. It is mirrored into each Lambda that needs it
// (see deploy.sh sync step) so it ships inside every deployment package.

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'info@awsugmdu.in';
const APP_URL = (process.env.APP_URL || 'https://www.awsugmdu.in').replace(/\/$/, '');
const BRAND_NAME = 'AWS User Group Madurai';

/**
 * Send an email via SES. Never throws - returns { ok, error? }.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to    Recipient address(es).
 * @param {string}          opts.subject
 * @param {string}          opts.html  HTML body.
 * @param {string}          [opts.text] Plain-text fallback (auto-derived if omitted).
 * @param {string}          [opts.replyTo]
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  const toAddresses = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

  if (toAddresses.length === 0) {
    console.warn('sendEmail: no recipient, skipping');
    return { ok: false, error: 'no recipient' };
  }

  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: toAddresses },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text || htmlToText(html), Charset: 'UTF-8' },
      },
    },
  };

  if (replyTo) {
    params.ReplyToAddresses = Array.isArray(replyTo) ? replyTo : [replyTo];
  }

  try {
    await sesClient.send(new SendEmailCommand(params));
    console.log('Email sent to:', toAddresses.join(', '));
    return { ok: true };
  } catch (error) {
    console.error('Failed to send email to', toAddresses.join(', '), '-', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Wrap body content in the branded HTML layout.
 *
 * @param {object} opts
 * @param {string} opts.heading   Large heading shown at the top of the card.
 * @param {string} opts.bodyHtml  Inner HTML (paragraphs etc.).
 * @param {object} [opts.cta]     { label, url } - renders a button.
 * @param {string} [opts.footerNote] Extra small-print line above the footer.
 * @returns {string} full HTML document
 */
function renderEmail({ heading, bodyHtml, cta, footerNote }) {
  const ctaHtml = cta && cta.url && cta.label
    ? `
      <tr>
        <td style="padding: 8px 0 24px;">
          <a href="${escapeAttr(cta.url)}"
             style="display:inline-block; background:#ff9900; color:#000000; text-decoration:none;
                    font-weight:600; font-size:16px; padding:14px 28px; border-radius:8px;">
            ${escapeHtml(cta.label)}
          </a>
        </td>
      </tr>`
    : '';

  const footerNoteHtml = footerNote
    ? `<p style="margin:0 0 8px; color:#8a8a8a; font-size:12px; line-height:18px;">${escapeHtml(footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0; padding:0; background:#f4f5f7; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden;
                      box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#232f3e; padding:24px 32px;">
              <span style="color:#ffffff; font-size:18px; font-weight:700;">AWS User Group</span>
              <span style="color:#ff9900; font-size:18px; font-weight:700;"> Madurai</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0 0 16px; color:#232f3e; font-size:22px; line-height:30px;">${escapeHtml(heading)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="color:#3a3a3a; font-size:15px; line-height:23px;">
                    ${bodyHtml}
                  </td>
                </tr>
                ${ctaHtml}
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px; border-top:1px solid #eaeaea;">
              ${footerNoteHtml}
              <p style="margin:0; color:#8a8a8a; font-size:12px; line-height:18px;">
                ${escapeHtml(BRAND_NAME)} ·
                <a href="${escapeAttr(APP_URL)}" style="color:#8a8a8a;">${escapeHtml(stripProtocol(APP_URL))}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- small helpers -----------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function stripProtocol(url) {
  return String(url || '').replace(/^https?:\/\//, '');
}

// Very small HTML -> text fallback (strips tags, collapses whitespace).
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

module.exports = { sendEmail, renderEmail, APP_URL, FROM_EMAIL, BRAND_NAME };
