/** Shared by the deployment guard and authentication configuration.
 * @param {Record<string, string | undefined>} env
 */
export function getEmailPolicy(env) {
  const mode = env.EMAIL_DELIVERY ?? (env.VERCEL === '1' ? 'resend' : 'disabled');
  if (mode !== 'resend' && mode !== 'disabled')
    throw new Error('EMAIL_DELIVERY must be resend or disabled.');
  const deliveryEnabled = mode === 'resend';
  const requireVerification = env.VERCEL === '1';
  return {
    mode,
    deliveryEnabled,
    requireVerification,
    signupEnabled: !requireVerification || deliveryEnabled,
    passwordResetEnabled: deliveryEnabled,
  };
}
