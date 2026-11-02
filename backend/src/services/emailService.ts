
import nodemailer from 'nodemailer'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }

    return entities[character]
  })
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  const gmailUser = process.env.GMAIL_USER?.trim()
  const gmailAppPassword =
    process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '')

  if (!gmailUser || !gmailAppPassword) {
    throw new Error(
      'Gmail is not configured. Check GMAIL_USER and GMAIL_APP_PASSWORD in .env.',
    )
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
    tls: {
      rejectUnauthorized: true,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  })

  const safeName = escapeHtml(name)
  const safeResetUrl = escapeHtml(resetUrl)

  try {
    // Verify the SMTP connection and authentication.
    await transporter.verify()

    await transporter.sendMail({
      from: `"IntellMeet" <${gmailUser}>`,
      to: email,
      subject: 'Reset your IntellMeet password',

      text: `Hello ${name},

We received a request to reset your IntellMeet password.

Use this link to reset your password:
${resetUrl}

This link expires in 15 minutes.

If you did not request this, you can ignore this email.`,

      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Reset your IntellMeet password</h2>
          <p>Hello ${safeName},</p>
          <p>We received a request to reset your IntellMeet password.</p>
          <p>
            <a href="${safeResetUrl}"
               style="display:inline-block;padding:12px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">
              Reset Password
            </a>
          </p>
          <p>This link expires in 15 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
    })
  } finally {
    transporter.close()
  }
}
