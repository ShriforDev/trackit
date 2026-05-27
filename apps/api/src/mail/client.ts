import nodemailer, { type Transporter } from "nodemailer"

export interface SendMailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.gmail.com"
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465)
const SMTP_USER = process.env.SMTP_USER ?? ""
const SMTP_PASS = process.env.SMTP_PASS ?? ""
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME ?? "trackit"

const SMTP_CONFIGURED = Boolean(SMTP_USER && SMTP_PASS && SMTP_FROM)

let transporter: Transporter | null = null

if (SMTP_CONFIGURED) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 → implicit TLS; 587 → STARTTLS (and `secure: false` lets nodemailer upgrade).
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
  console.log(
    `[mail] SMTP ready — ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_FROM_NAME} <${SMTP_FROM}>`
  )
} else {
  console.log(
    "[mail] SMTP not configured (SMTP_USER / SMTP_PASS empty). Emails will be logged to stdout only."
  )
}

/**
 * Send a transactional email. Always non-throwing — a delivery failure logs
 * the error and returns. Callers should treat email as fire-and-forget; the
 * link is also logged to stdout for fallback recovery.
 */
export async function sendMail(opts: SendMailOptions): Promise<void> {
  if (!transporter) {
    console.log(
      `[mail] (stdout-only) to=${opts.to} subject="${opts.subject}"\n${opts.text}`
    )
    return
  }

  try {
    const info = await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    })
    console.log(
      `[mail] sent  to=${opts.to}  subject="${opts.subject}"  messageId=${info.messageId}`
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      `[mail] send FAILED  to=${opts.to}  subject="${opts.subject}"  error=${message}`
    )
  }
}
