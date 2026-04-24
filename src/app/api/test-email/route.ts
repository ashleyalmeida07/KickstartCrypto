import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

/**
 * GET /api/test-email
 * Quick SMTP diagnostic — only available in development.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const config = {
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false',
    user:   process.env.SMTP_USER,
    pass:   process.env.SMTP_PASS ? '✅ set' : '❌ MISSING',
    from:   process.env.SMTP_FROM,
  };

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({ error: 'SMTP_USER or SMTP_PASS not set', config }, { status: 500 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT ?? 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.verify();

    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to:      process.env.SMTP_USER, // send to yourself
      subject: '✅ KickstartCrypto SMTP Test',
      html:    '<h2>SMTP is working!</h2><p>If you received this, your email configuration is correct.</p>',
    });

    return NextResponse.json({ ok: true, message: `Test email sent to ${process.env.SMTP_USER}`, config });
  } catch (err) {
    return NextResponse.json({
      error:   (err as Error).message,
      config,
    }, { status: 500 });
  }
}
