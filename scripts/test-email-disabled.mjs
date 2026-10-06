import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

// A unique disposable SQLite database; this test never uses provider credentials.
const databasePath = fileURLToPath(
  new URL(`../prisma/email-disabled-${randomUUID()}.db`, import.meta.url),
);
const databaseUrl = `file:${databasePath.replaceAll('\\', '/')}`;
const origin = 'http://localhost:3001';
const env = {
  ...process.env,
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  EMAIL_DELIVERY: 'disabled',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  VERCEL: '1',
  NODE_ENV: 'production',
};
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let server;
let exited;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
try {
  const migration = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema=prisma/schema.prisma'],
    { env, windowsHide: true, encoding: 'utf8' },
  );
  assert.equal(migration.status, 0, 'The disposable SQLite migration must succeed.');
  const password = 'Disposable-Auth-Test-12345';
  const hashed = await hashPassword(password);
  for (const verified of [true, false]) {
    const id = randomUUID();
    await db.user.create({
      data: {
        id,
        email: `${verified ? 'verified' : 'unverified'}@example.test`,
        name: 'Disposable Test',
        emailVerified: verified,
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: 'credential', password: hashed },
        },
      },
    });
  }
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3001'],
    { env, windowsHide: true, stdio: 'ignore' },
  );
  exited = new Promise((resolve) => {
    server.once('exit', resolve);
    server.once('error', resolve);
  });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (health.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the isolated server. */
    }
    await pause(300);
  }
  check(ready, 'The isolated auth server must start. Run npm run build first.');
  const post = (path, body) =>
    fetch(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  const signup = await post('sign-up/email', {
    email: 'new@example.test',
    name: 'New Test',
    password,
  });
  check(
    signup.status === 400 && (await signup.json()).code === 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
    'Signup must be rejected at the API.',
  );
  check((await db.user.count()) === 2, 'A rejected signup must not create an account.');
  const reset = await post('request-password-reset', {
    email: 'verified@example.test',
    redirectTo: `${origin}/login`,
  });
  check(
    reset.status === 400 && (await reset.json()).code === 'RESET_PASSWORD_DISABLED',
    'Reset requests must be rejected before sending mail.',
  );
  check((await db.verification.count()) === 0, 'A rejected reset must not issue a token.');
  const unverified = await post('sign-in/email', { email: 'unverified@example.test', password });
  check(
    unverified.status === 403 && (await unverified.json()).code === 'EMAIL_NOT_VERIFIED',
    'Disabling email must not admit an unverified account.',
  );
  const verified = await post('sign-in/email', { email: 'verified@example.test', password });
  check(verified.status === 200, 'An existing verified account must still sign in.');
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const session = await fetch(`${origin}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  }).then((response) => response.json());
  check(
    session?.user?.email === 'verified@example.test',
    'Verified sign-in must produce a valid session.',
  );
  const page = await fetch(`${origin}/login`).then((response) => response.text());
  check(
    page.includes('New account registration and password reset are temporarily unavailable.') &&
      !page.includes('Join the movement') &&
      !page.includes('Forgot password?'),
    'The login page must explain unavailable actions and hide them.',
  );
  console.log(
    `Deferred-email authentication: ${checks} checks passed with an isolated SQLite database.`,
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([exited, pause(5000)]);
  }
  await db.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm'])
    await rm(databasePath + suffix, { force: true });
}
