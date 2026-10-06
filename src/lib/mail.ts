import 'server-only';
import { getEmailPolicy } from './email-policy.mjs';
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export async function sendMail(to: string, subject: string, text: string) {
  if (
    !getEmailPolicy(process.env).deliveryEnabled ||
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM
  )
    throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Email delivery failed. Please retry.');
}
