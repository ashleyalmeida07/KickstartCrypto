import nodemailer from 'nodemailer';

/**
 * Shared nodemailer transporter using SMTP credentials from .env.local
 *
 * Required env vars:
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       e.g. 465
 *   SMTP_SECURE     "true" for port 465, "false" for 587
 *   SMTP_USER       your-email@gmail.com
 *   SMTP_PASS       app-password (not your account password)
 *   SMTP_FROM       "KickstartCrypto <no-reply@yourdomain.com>"
 */
// ── Lazy transporter factory — re-reads env vars on every call ────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });
}

const FROM = process.env.SMTP_FROM ?? 'KickstartCrypto <no-reply@kickstartcrypto.app>';

// ── Brand constants ────────────────────────────────────────────────────────────
const BRAND_COLOR = '#00C896';
const BG_COLOR = '#f8fafc';
const TEXT_COLOR = '#09090b';
const MUTED_COLOR = '#64748b';
const BORDER_COLOR = '#e2e8f0';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ── Base HTML wrapper ──────────────────────────────────────────────────────────
function emailWrapper(content: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${previewText}</title>
  <style>
    body { margin:0; padding:0; background:${BG_COLOR}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width:560px; margin:40px auto; background:#fff; border:1px solid ${BORDER_COLOR}; border-radius:12px; overflow:hidden; }
    .header { background:${TEXT_COLOR}; padding:28px 32px; }
    .header-logo { font-size:20px; font-weight:800; color:#fff; letter-spacing:-0.5px; }
    .header-logo span { color:${BRAND_COLOR}; }
    .body { padding:32px; color:${TEXT_COLOR}; font-size:15px; line-height:1.7; }
    .title { font-size:22px; font-weight:700; color:${TEXT_COLOR}; margin:0 0 8px; }
    .subtitle { color:${MUTED_COLOR}; font-size:14px; margin:0 0 24px; }
    .card { background:${BG_COLOR}; border:1px solid ${BORDER_COLOR}; border-radius:8px; padding:20px 24px; margin:20px 0; }
    .card-label { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:${MUTED_COLOR}; font-weight:600; margin-bottom:4px; }
    .card-value { font-size:18px; font-weight:700; color:${TEXT_COLOR}; }
    .btn { display:inline-block; padding:12px 24px; background:${BRAND_COLOR}; color:#fff; text-decoration:none; border-radius:6px; font-weight:700; font-size:14px; margin:20px 0; }
    .btn-danger { background:#dc2626; }
    .divider { border:none; border-top:1px solid ${BORDER_COLOR}; margin:24px 0; }
    .footer { padding:20px 32px; background:${BG_COLOR}; border-top:1px solid ${BORDER_COLOR}; }
    .footer p { margin:0; font-size:12px; color:${MUTED_COLOR}; }
    .footer a { color:${BRAND_COLOR}; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-logo">Kickstart<span>Crypto</span></div>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>You're receiving this because you signed up at <a href="${APP_URL}">KickstartCrypto</a>.</p>
      <p style="margin-top:6px;">© ${new Date().getFullYear()} KickstartCrypto. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Email sending helper ───────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP_USER or SMTP_PASS not configured — skipping.');
    return;
  }
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? FROM,
      to,
      subject,
      html,
    });
    console.log(`[Email]  Sent "${subject}" → ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}" → ${to}:`, (err as Error).message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── TEMPLATE 1: Welcome email (new user registration) ─────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendWelcomeEmail(to: string, name: string) {
  const displayName = name || 'there';
  const subject = 'Welcome to KickstartCrypto!';
  const html = emailWrapper(`
    <h1 class="title">Welcome, ${displayName}!</h1>
    <p class="subtitle">Your account has been created successfully.</p>
    <p>You're now part of the first decentralised crowdfunding platform built on Ethereum. Here's what you can do:</p>
    <ul style="padding-left:20px; color:${MUTED_COLOR}; font-size:14px; line-height:2;">
      <li>Launch a crowdfunding campaign with milestone-based payouts</li>
      <li>Back promising projects and vote on milestone releases</li>
      <li>Track every transaction — fully transparent on-chain</li>
    </ul>
    <a href="${APP_URL}/explore" class="btn">Explore Campaigns</a>
    <hr class="divider" />
    <p style="font-size:13px; color:${MUTED_COLOR};">If you didn't create this account, please ignore this email.</p>
  `, subject);

  await sendEmail(to, subject, html);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── TEMPLATE 2: Campaign created successfully ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendCampaignCreatedEmail(
  to: string,
  campaignTitle: string,
  contractAddress: string,
  goalEth: string,
) {
  const subject = `Your campaign "${campaignTitle}" is live!`;
  const html = emailWrapper(`
    <h1 class="title">Campaign is live!</h1>
    <p class="subtitle">Your crowdfunding campaign has been deployed to the Ethereum blockchain.</p>
    <div class="card">
      <div class="card-label">Campaign</div>
      <div class="card-value">${campaignTitle}</div>
    </div>
    <div class="card">
      <div class="card-label">Funding Goal</div>
      <div class="card-value">${goalEth} ETH</div>
    </div>
    <div class="card">
      <div class="card-label">Contract Address</div>
      <div style="font-family:monospace; font-size:13px; color:${MUTED_COLOR}; word-break:break-all;">${contractAddress}</div>
    </div>
    <a href="${APP_URL}/campaign/${contractAddress}" class="btn">View Campaign</a>
    <hr class="divider" />
    <p style="font-size:13px; color:${MUTED_COLOR};">Share your campaign link with friends to start raising funds!</p>
  `, subject);

  await sendEmail(to, subject, html);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── TEMPLATE 3: Campaign funded (goal reached) ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendCampaignFundedEmail(
  to: string,
  campaignTitle: string,
  contractAddress: string,
  raisedEth: string,
) {
  const subject = `Congratulations! "${campaignTitle}" reached its goal!`;
  const html = emailWrapper(`
    <h1 class="title">Goal Reached!</h1>
    <p class="subtitle">Your campaign has been fully funded. Congratulations!</p>
    <div class="card">
      <div class="card-label">Campaign</div>
      <div class="card-value">${campaignTitle}</div>
    </div>
    <div class="card">
      <div class="card-label">Total Raised</div>
      <div class="card-value" style="color:${BRAND_COLOR};">${raisedEth} ETH</div>
    </div>
    <p>After the campaign deadline passes, you can go to your campaign management page and request payouts for each milestone. Backers will vote to approve each release.</p>
    <a href="${APP_URL}/manage/${contractAddress}" class="btn">Manage Campaign</a>
  `, subject);

  await sendEmail(to, subject, html);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── TEMPLATE 4: Campaign suspended by admin ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendCampaignSuspendedEmail(
  to: string,
  campaignTitle: string,
  contractAddress: string,
  reason: string | null,
) {
  const subject = `Important: Your campaign "${campaignTitle}" has been suspended`;
  const html = emailWrapper(`
    <h1 class="title" style="color:#dc2626;">Campaign Suspended</h1>
    <p class="subtitle">Your campaign has been temporarily suspended by the platform team.</p>
    <div class="card" style="border-color:#fca5a5; background:#fff5f5;">
      <div class="card-label">Campaign</div>
      <div class="card-value">${campaignTitle}</div>
    </div>
    ${reason ? `
    <div class="card" style="border-color:#fca5a5; background:#fff5f5;">
      <div class="card-label">Reason</div>
      <div style="font-size:14px; color:#7f1d1d; margin-top:4px;">${reason}</div>
    </div>` : ''}
    <p style="color:${MUTED_COLOR}; font-size:14px;">
      Your campaign has been hidden from the Explore page. If you believe this is an error,
      please contact our support team.
    </p>
    <a href="mailto:support@kickstartcrypto.app" class="btn btn-danger">Contact Support</a>
    <hr class="divider" />
    <p style="font-size:13px; color:${MUTED_COLOR};">Contract: <span style="font-family:monospace;">${contractAddress}</span></p>
  `, subject);

  await sendEmail(to, subject, html);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── TEMPLATE 5: Contributor refund notification ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendContributorRefundEmail(
  to: string,
  campaignTitle: string,
  contractAddress: string,
  refundEth: string,
) {
  const subject = `Your refund for "${campaignTitle}" has been processed`;
  const html = emailWrapper(`
    <h1 class="title">Refund Processed</h1>
    <p class="subtitle">Your contribution has been refunded to your wallet.</p>
    <div class="card">
      <div class="card-label">Campaign</div>
      <div class="card-value">${campaignTitle}</div>
    </div>
    <div class="card">
      <div class="card-label">Amount Refunded</div>
      <div class="card-value" style="color:${BRAND_COLOR};">${refundEth} ETH</div>
    </div>
    <p style="color:${MUTED_COLOR}; font-size:14px;">
      The campaign did not reach its goal. Your full contribution has been returned to your wallet automatically.
      It may take a few minutes to appear depending on network congestion.
    </p>
    <a href="${APP_URL}/explore" class="btn">Explore Other Campaigns</a>
    <hr class="divider" />
    <p style="font-size:13px; color:${MUTED_COLOR};">Contract: <span style="font-family:monospace;">${contractAddress}</span></p>
  `, subject);

  await sendEmail(to, subject, html);
}

