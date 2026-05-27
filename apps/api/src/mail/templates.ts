interface InvitationEmailInput {
  inviterName: string
  organizationName: string
  role: string
  url: string
  /** Approximate expiration window, e.g. "7 days". */
  expiresIn: string
}

interface RenderedEmail {
  subject: string
  text: string
  html: string
}

/**
 * Renders the invitation email body. Subject is short and personal so it
 * reads well in inbox previews. HTML uses inline styles only — most email
 * clients strip <style> blocks and ignore class names.
 */
export function renderInvitationEmail(
  input: InvitationEmailInput
): RenderedEmail {
  const { inviterName, organizationName, role, url, expiresIn } = input

  const subject = `${inviterName} invited you to ${organizationName} on trackit`

  const text = [
    `${inviterName} invited you to join "${organizationName}" on trackit as ${role}.`,
    ``,
    `Accept the invitation:`,
    url,
    ``,
    `Don't share this link. Anyone who opens it can join "${organizationName}" as ${role}.`,
    ``,
    `This invitation expires in ${expiresIn}. Didn't expect this? You can safely ignore it.`,
    ``,
    `— trackit`,
  ].join("\n")

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0a0a0a;-webkit-font-smoothing:antialiased">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;padding:40px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e5e5e5;max-width:480px">
            <tr>
              <td style="padding:32px 32px 24px 32px">
                <span style="display:inline-block;padding:5px 8px;background:#0a0a0a;color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.04em">trackit</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px 32px;font-size:18px;font-weight:600;line-height:1.3;color:#0a0a0a">
                You're invited to ${escapeHtml(organizationName)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;font-size:14px;line-height:1.6;color:#404040">
                <strong>${escapeHtml(inviterName)}</strong> invited you to join
                <strong>${escapeHtml(organizationName)}</strong> on trackit as
                <strong>${escapeHtml(role)}</strong>.
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px">
                <a href="${escapeAttr(url)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;padding:11px 18px;text-decoration:none;font-size:13px;font-weight:500">Accept invitation</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;font-size:12px;line-height:1.6;color:#737373">
                Or paste this link into your browser:<br />
                <a href="${escapeAttr(url)}" style="color:#737373;word-break:break-all">${escapeHtml(url)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 20px 32px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border:1px solid #fdba74">
                  <tr>
                    <td style="padding:10px 12px;font-size:11px;line-height:1.6;color:#9a3412">
                      <strong style="color:#7c2d12">Don&rsquo;t share this link.</strong>
                      Anyone who opens it can join
                      <strong>${escapeHtml(organizationName)}</strong> as
                      ${escapeHtml(role)}.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px;border-top:1px solid #f0f0f0;font-size:12px;line-height:1.6;color:#a3a3a3">
                This invitation expires in ${escapeHtml(expiresIn)}. Didn't expect this? You can safely ignore the email.
              </td>
            </tr>
          </table>
          <p style="font-size:11px;color:#a3a3a3;margin:16px 0 0 0">trackit · multi-tenant device tracking</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}
