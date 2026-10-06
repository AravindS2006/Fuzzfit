import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
process.loadEnvFile('.env');
const base = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw new Error('API integration tests must run against a local test server.');
const db = new PrismaClient();
const suffix = Date.now();
const password = randomBytes(24).toString('base64url');
const users = [];
let checks = 0;
async function request(path, body, jar = {}, method = body ? 'POST' : 'GET', origin = base) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Origin: origin,
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) jar.cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  let json;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}
async function check(path, body, jar, status = 200, method) {
  const result = await request(path, body, jar, method);
  assert.equal(result.status, status, `${path}: ${JSON.stringify(result.json)}`);
  checks++;
  return result.json;
}
async function signup(name) {
  const jar = {};
  const email = `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}@example.test`;
  const result = await check(
    '/api/auth/sign-up/email',
    { name, email, password, role: 'admin' },
    jar,
  );
  users.push(result.user.id);
  return { ...jar, id: result.user.id, email };
}
try {
  await check('/api/workspace', undefined, {}, 401);
  const coach = await signup('Coach One'),
    other = await signup('Coach Two'),
    trainee = await signup('Trainee');
  assert.equal((await db.user.findUnique({ where: { id: coach.id } })).role, 'unset');
  checks++;
  await check(
    '/api/command',
    {
      action: 'onboard',
      role: 'coach',
      name: 'Coach One',
      studioName: 'Integration Studio',
      adult: true,
    },
    coach,
  );
  await check(
    '/api/command',
    { action: 'onboard', role: 'coach', name: 'Coach Two', adult: true },
    other,
  );
  await check(
    '/api/command',
    { action: 'onboard', role: 'trainee', name: 'Trainee', adult: true },
    trainee,
  );
  await check(
    '/api/command',
    { action: 'onboard', role: 'coach', name: 'New Role', adult: true },
    trainee,
    409,
  );
  const invite = await check('/api/command', { action: 'invite', email: trainee.email }, coach);
  await check('/api/command', { action: 'acceptInvite', code: invite.code }, trainee);
  await check('/api/command', { action: 'acceptInvite', code: invite.code }, trainee, 400);
  const workspace = await check('/api/workspace', undefined, coach);
  assert.equal(workspace.clients.length, 1);
  checks++;
  const start = new Date(Date.now() + 3600000).toISOString();
  await check(
    '/api/command',
    {
      action: 'createClass',
      title: 'Forbidden client',
      startsAt: start,
      duration: 45,
      capacity: 8,
      participantIds: [trainee.id],
    },
    other,
    403,
  );
  const item = await check(
    '/api/command',
    {
      action: 'createClass',
      title: 'Integration class',
      startsAt: start,
      duration: 45,
      capacity: 8,
      participantIds: [trainee.id],
    },
    coach,
  );
  await check(`/api/classes/${item.id}`, undefined, other, 404);
  await check(
    '/api/command',
    { action: 'classControl', id: item.id, control: 'start' },
    trainee,
    403,
  );
  await check('/api/video/token', { classId: item.id }, trainee, 409);
  await check('/api/command', { action: 'classControl', id: item.id, control: 'start' }, coach);
  await check('/api/video/token', { classId: item.id }, trainee, 403);
  await check('/api/command', { action: 'consent', id: item.id, consent: true }, trainee);
  const metric = {
    classId: item.id,
    exercise: 'squat',
    revision: 0,
    reps: 2,
    holdSeconds: 0,
    score: 90,
    confidence: 0.95,
    phase: 'start position',
    cue: 'Continue comfortably.',
  };
  await check('/api/metrics', metric, trainee);
  await check('/api/metrics', { ...metric, reps: 1 }, trainee, 409);
  await check(
    '/api/command',
    {
      action: 'message',
      id: item.id,
      text: 'Private coaching cue',
      kind: 'cue',
      recipientId: trainee.id,
    },
    coach,
  );
  await check(
    '/api/command',
    { action: 'message', id: item.id, text: 'Spoofed coach cue', kind: 'cue' },
    trainee,
    403,
  );
  await check(
    '/api/command',
    { action: 'message', id: item.id, text: 'Wrong target', recipientId: other.id },
    coach,
    400,
  );
  const foreign = await check('/api/workspace', undefined, other);
  assert.equal(foreign.classes.length, 0);
  assert.equal(foreign.clients.length, 0);
  checks++;
  const noOrigin = await request(
    '/api/command',
    { action: 'profile', name: 'Trainee', goal: 'Move well' },
    trainee,
    'POST',
    'https://attacker.example',
  );
  assert.equal(noOrigin.status, 403);
  checks++;
  await check(
    '/api/command',
    { action: 'classControl', id: item.id, control: 'exercise', exercise: 'curl' },
    coach,
  );
  await check('/api/metrics', metric, trainee, 409);
  await check('/api/command', { action: 'classControl', id: item.id, control: 'end' }, coach);
  await check('/api/video/token', { classId: item.id }, trainee, 409);
  const personal = await check('/api/export', undefined, trainee);
  assert.equal(personal.profile.email, trainee.email);
  assert.equal(personal.workouts[0].summary.totalReps, 2);
  checks++;
  const health = await check('/api/health');
  assert.equal(health.status, 'ok');
  checks++;
  await check('/api/retention', undefined, {}, 401);
  console.log(
    `PASS: ${checks} authentication, access-control, lifecycle, metrics, and export checks.`,
  );
} finally {
  await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
