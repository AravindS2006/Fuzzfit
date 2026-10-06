export const requiredProductionKeys = [
  'DATABASE_PROVIDER',
  'DATABASE_URL',
  'DIRECT_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'CRON_SECRET',
];

const placeholder = (value) =>
  /replace-with|your-verified-domain|your-domain|<[^>@]+>|\[SENSITIVE\]|\.\.\./i.test(value);
const localHost = (host) =>
  /^(localhost|127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(host) || host.endsWith('.localhost');

/** Validate configuration without including secret values in diagnostics.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function validateProductionConfig(env) {
  const errors = [];
  const missing = requiredProductionKeys.filter((key) => !env[key]?.trim());
  if (missing.length) errors.push(`Missing required keys: ${missing.join(', ')}.`);
  for (const key of requiredProductionKeys) {
    if (env[key] && placeholder(env[key])) errors.push(`${key} contains a template placeholder.`);
  }
  if (env.DATABASE_PROVIDER !== 'postgresql') errors.push('DATABASE_PROVIDER must be postgresql.');
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.username ||
        !url.password ||
        !url.hostname ||
        url.pathname.length < 2 ||
        localHost(url.hostname) ||
        url.searchParams.get('sslmode') === 'disable'
      )
        errors.push(
          `${key} must be a remote PostgreSQL connection URL with credentials and a database; do not disable TLS.`,
        );
    } catch {
      errors.push(`${key} must be a valid PostgreSQL connection URL.`);
    }
  }
  for (const [key, protocol] of [
    ['BETTER_AUTH_URL', 'https:'],
    ['LIVEKIT_URL', 'wss:'],
  ]) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]);
      if (
        url.protocol !== protocol ||
        !url.hostname ||
        localHost(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        errors.push(
          `${key} must be a secure, public origin without a path, credentials, query, or fragment.`,
        );
    } catch {
      errors.push(`${key} must be a valid secure origin.`);
    }
  }
  for (const key of ['BETTER_AUTH_SECRET', 'CRON_SECRET']) {
    if (env[key] && env[key].length < 32) errors.push(`${key} must be at least 32 characters.`);
  }
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET === env.CRON_SECRET)
    errors.push('Use independent auth and cleanup secrets.');
  if (env.EMAIL_FROM) {
    const sender = env.EMAIL_FROM.match(/^(?:[^<>]+<)?([^<>\s]+@[^<>\s]+\.[^<>\s]+)>?$/)?.[1];
    if (!sender || /@(resend\.dev|example\.(com|test|org))$/i.test(sender))
      errors.push('EMAIL_FROM must use an actual address on your verified sending domain.');
  }
  const billingKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID'];
  const billingConfigured = billingKeys.filter((key) => !!env[key]?.trim());
  if (billingConfigured.length && billingConfigured.length !== billingKeys.length)
    errors.push('Billing requires all three Stripe keys, or leave all three unset.');
  return errors;
}
