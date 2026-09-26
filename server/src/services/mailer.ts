/**
 * Outgoing email (server-side only; SMTP credentials never reach the browser).
 * With SMTP configured, messages go out through nodemailer. Without it, notifications
 * are written to the server log so nothing is lost in local development.
 */
import nodemailer from "nodemailer";
import type { AppConfig } from "../config";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  configured: boolean;
  send(message: MailMessage): Promise<void>;
}

type Logger = Pick<Console, "info" | "warn" | "error">;

export function createMailer(cfg: AppConfig, logger: Logger): Mailer {
  const { smtp } = cfg;
  if (!smtp.host) {
    return {
      configured: false,
      async send(msg) {
        logger.info(`[mail] SMTP not configured, so this email was not sent. To: ${msg.to} | ${msg.subject}\n${msg.text}`);
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure, // true for port 465; otherwise STARTTLS is negotiated
    requireTLS: !smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return {
    configured: true,
    async send(msg) {
      await transport.sendMail({ from: smtp.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    },
  };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function signupNotification(opts: { to: string; email: string; createdAt: string; appUrl: string }): MailMessage {
  const when = new Date(opts.createdAt).toUTCString();
  const link = opts.appUrl ? `${opts.appUrl}/admin` : "";
  return {
    to: opts.to,
    subject: `New Ledgerly signup request: ${opts.email}`,
    text: [
      "A new account is waiting for your approval.",
      "",
      `Email: ${opts.email}`,
      `Requested: ${when}`,
      "Status: pending",
      "",
      link ? `Review it in the admin dashboard: ${link}` : "Review it in the Ledgerly admin dashboard.",
    ].join("\n"),
    html: `<p>A new account is waiting for your approval.</p>
<table cellpadding="4">
<tr><td><strong>Email</strong></td><td>${escapeHtml(opts.email)}</td></tr>
<tr><td><strong>Requested</strong></td><td>${escapeHtml(when)}</td></tr>
<tr><td><strong>Status</strong></td><td>pending</td></tr>
</table>
<p>${link ? `<a href="${escapeHtml(link)}">Open the admin dashboard</a>` : "Review it in the Ledgerly admin dashboard."}</p>`,
  };
}
