import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
process.loadEnvFile('.env');
// Simulate independent clients at the trusted local proxy boundary without disabling rate limits.
const testAddress = () =>
  `2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}::1`;
test('a real coach account can onboard and persist a workout plan', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': testAddress() });
  const email = `browser-coach-${Date.now()}@example.test`;
  const db = new PrismaClient();
  try {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Browser Coach');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Local-Integration-Only-12345');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'How do you want to move?' })).toBeVisible();
    await page.getByLabel('Your name', { exact: true }).fill('Browser Coach');
    await page.getByLabel('Studio name').fill('Browser test studio');
    await page.getByRole('checkbox', { name: /I am 18/ }).check();
    await page.getByRole('button', { name: 'Create my workspace' }).click();
    await expect(page.getByRole('heading', { name: 'A good day to make progress.' })).toBeVisible();
    await page.getByRole('link', { name: 'Workout plans' }).click();
    await page.getByRole('button', { name: 'Create plan', exact: true }).first().click();
    await page.getByLabel('Plan name').fill('Persisted foundations');
    await page
      .getByLabel('A little context')
      .fill('A real database record in the local test environment.');
    await page.getByRole('button', { name: 'Save workout plan' }).click();
    await expect(page.getByRole('heading', { name: 'Persisted foundations' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Persisted foundations' })).toBeVisible();
  } finally {
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.auditEvent.deleteMany({ where: { actorId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  }
});

test('session controls wait for delayed client scripts before accepting a click', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': testAddress() });
  const email = `hydration-coach-${Date.now()}@example.test`;
  const db = new PrismaClient();
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  const headers = { Origin: 'http://localhost:3000' };
  try {
    const signup = await page.request.post('http://localhost:3000/api/auth/sign-up/email', {
      headers,
      data: { name: 'Loading Coach', email, password: 'Local-Integration-Only-12345' },
    });
    expect(signup.ok()).toBe(true);
    const setup = await page.request.post('http://localhost:3000/api/command', {
      headers,
      data: { action: 'onboard', name: 'Loading Coach', role: 'coach', adult: true },
    });
    expect(setup.ok()).toBe(true);
    const scheduled = await page.request.post('http://localhost:3000/api/command', {
      headers,
      data: {
        action: 'createClass',
        title: 'Loading rehearsal',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        duration: 30,
        capacity: 2,
        participantIds: [],
      },
    });
    expect(scheduled.ok()).toBe(true);
    const session = await scheduled.json();
    await page.route('**/_next/static/**/*.js', async (route) => {
      await scriptsReady;
      await route.continue();
    });
    await page.goto(`/studio/${session.id}`, { waitUntil: 'commit' });
    await expect(page.locator('.live-studio')).toBeVisible();
    await expect(
      page
        .getByRole('button', { name: 'Start class', includeHidden: true })
        .click({ timeout: 500 }),
    ).rejects.toThrow(/Timeout/);
    const beforeReady = await page.request.get(`http://localhost:3000/api/classes/${session.id}`);
    expect((await beforeReady.json()).status).toBe('scheduled');
    releaseScripts();
    await page.getByRole('button', { name: 'Start class', exact: true }).click();
    await expect(page.getByRole('button', { name: 'End session', exact: true })).toBeVisible();
  } finally {
    releaseScripts();
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.auditEvent.deleteMany({ where: { actorId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  }
});

test('a trainee follows an invitation through signup, onboarding, enrollment, and class completion', async ({
  browser,
}) => {
  test.setTimeout(60000);
  const suffix = Date.now();
  const coachEmail = `journey-coach-${suffix}@example.test`;
  const traineeEmail = `journey-trainee-${suffix}@example.test`;
  const db = new PrismaClient();
  const coachContext = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': testAddress() },
  });
  const traineeContext = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': testAddress() },
  });
  const coach = await coachContext.newPage();
  const trainee = await traineeContext.newPage();
  const headers = { Origin: 'http://localhost:3000' };
  try {
    const signup = await coachContext.request.post('http://localhost:3000/api/auth/sign-up/email', {
      headers,
      data: { name: 'Journey Coach', email: coachEmail, password: 'Local-Integration-Only-12345' },
    });
    expect(signup.ok()).toBe(true);
    const setup = await coachContext.request.post('http://localhost:3000/api/command', {
      headers,
      data: {
        action: 'onboard',
        name: 'Journey Coach',
        role: 'coach',
        studioName: 'Journey studio',
        adult: true,
      },
    });
    expect(setup.ok()).toBe(true);
    await coach.goto('http://localhost:3000/app?view=clients');
    await coach.getByRole('button', { name: 'Invite client', exact: true }).first().click();
    await coach.getByLabel('Client’s email').fill(traineeEmail);
    await coach.getByRole('button', { name: 'Create invite link' }).click();
    const inviteUrl = await coach.getByLabel('Invitation link').inputValue();
    await coach.getByRole('button', { name: 'Close dialog' }).click();
    await trainee.goto(inviteUrl);
    await trainee.getByRole('button', { name: 'Create account', exact: true }).click();
    await trainee.getByLabel('Your name', { exact: true }).fill('Journey Trainee');
    await trainee.getByLabel('Email address').fill(traineeEmail);
    await trainee.getByLabel('Password', { exact: true }).fill('Local-Integration-Only-12345');
    await trainee.getByRole('button', { name: 'Create account', exact: true }).click();
    await trainee.getByRole('button', { name: /I’m a trainee/ }).click();
    await expect(trainee.getByRole('button', { name: /I’m a trainee/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const setupAccessibility = await new AxeBuilder({ page: trainee })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      setupAccessibility.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ).toEqual([]);
    await trainee.getByLabel('Your name', { exact: true }).fill('Journey Trainee');
    await trainee.getByRole('checkbox', { name: /I am 18/ }).check();
    await trainee.getByRole('button', { name: 'Create my workspace' }).click();
    await trainee.getByRole('button', { name: 'Join studio' }).click();
    await expect(
      trainee.getByRole('heading', { name: 'Your next chapter starts here.' }),
    ).toBeVisible();
    await coach.reload();
    await expect(coach.getByRole('heading', { name: 'Journey Trainee' })).toBeVisible();
    await coach.getByRole('link', { name: 'Sessions', exact: true }).click();
    await coach.getByRole('button', { name: 'Schedule session', exact: true }).click();
    await coach.getByLabel('Session title').fill('A shared journey');
    await coach.getByRole('checkbox', { name: /Journey Trainee/ }).check();
    await coach
      .getByRole('dialog')
      .getByRole('button', { name: 'Schedule session', exact: true })
      .click();
    await coach.getByRole('button', { name: 'Open studio', exact: true }).click();
    const startResponsePromise = coach.waitForResponse(
      (response) => {
        if (!response.url().endsWith('/api/command') || response.request().method() !== 'POST')
          return false;
        const command = response.request().postDataJSON();
        return command?.action === 'classControl' && command.control === 'start';
      },
      { timeout: 15000 },
    );
    await coach.getByRole('button', { name: 'Start class', exact: true }).click();
    const startResponse = await startResponsePromise;
    expect(startResponse.status(), JSON.stringify(await startResponse.json())).toBe(200);
    await expect(coach.getByRole('button', { name: 'End session', exact: true })).toBeVisible();
    await trainee.getByRole('link', { name: 'Sessions', exact: true }).click();
    await expect(trainee.getByText('A shared journey', { exact: true })).toBeVisible();
    await trainee.getByRole('button', { name: 'Open studio', exact: true }).click();
    await expect(
      trainee.getByRole('button', { name: /Enable camera|Turn on session camera/ }),
    ).toBeVisible();
    const videoButton = trainee.getByRole('button', { name: 'Join live video', exact: true });
    await expect(videoButton).toBeVisible();
    const workspace = await coachContext.request.get('http://localhost:3000/api/workspace');
    expect(workspace.ok()).toBe(true);
    if ((await workspace.json()).services.video) {
      await videoButton.click();
      const consentDialog = trainee.getByRole('dialog');
      await expect(consentDialog.getByRole('button', { name: 'Join live video' })).toBeDisabled();
      await consentDialog.getByRole('button', { name: 'Close dialog' }).click();
    } else await expect(videoButton).toBeDisabled();
    await trainee.getByRole('button', { name: 'Ask my coach for help' }).click();
    await expect(coach.getByText('Help requested', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await coach.getByRole('button', { name: /Journey Trainee/ }).click();
    await coach.getByLabel('Coaching cue').fill('Let’s keep the movement controlled.');
    await coach.getByRole('button', { name: 'Send personal cue' }).click();
    await expect(trainee.locator('.human-cue')).toContainText(
      'Let’s keep the movement controlled.',
    );
    const accessibility = await new AxeBuilder({ page: trainee })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      accessibility.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ).toEqual([]);
    await coach.getByRole('button', { name: 'End session', exact: true }).click();
    await coach.getByRole('button', { name: 'End session for everyone' }).click();
    await expect(
      trainee.getByRole('heading', { name: 'That’s another step forward.' }),
    ).toBeVisible({ timeout: 10000 });
  } finally {
    for (const context of [coachContext, traineeContext]) {
      try {
        await context.close();
      } catch {
        // A timed-out test may already have closed its contexts. Preserve the original failure.
      }
    }
    const users = await db.user.findMany({
      where: { email: { in: [coachEmail, traineeEmail] } },
      select: { id: true },
    });
    await db.auditEvent.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
