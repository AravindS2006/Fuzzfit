import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from './db';
import { sendMail } from './mail';
export const auth = betterAuth({
  appName: 'Fuzzfit',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, {
    provider: process.env.DATABASE_PROVIDER === 'postgresql' ? 'postgresql' : 'sqlite',
  }),
  trustedOrigins: [process.env.BETTER_AUTH_URL || 'http://localhost:3000'],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: process.env.VERCEL === '1',
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        user.email,
        'Reset your Fuzzfit password',
        `Reset your password: ${url}\nIf you did not request this, ignore this email.`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: !!process.env.RESEND_API_KEY,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(
        user.email,
        'Verify your Fuzzfit email',
        `Welcome to Fuzzfit. Verify your email: ${url}`,
      );
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'unset', input: false },
      goal: { type: 'string', defaultValue: 'Build strength & consistency', input: false },
      consentVersion: { type: 'string', required: false, input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 3 },
    },
  },
});
