import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

process.loadEnvFile('.env');

test('a trainee can resize, minimize, and restore the coach without replacing workout tracking', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const fixtureId = randomUUID();
  const coachEmail = `coach-layout-${fixtureId}@example.test`;
  const traineeEmail = `trainee-layout-${fixtureId}@example.test`;
  const address = () =>
    `2001:db8:${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}::1`;
  const coachAddress = address();
  const traineeAddress = address();
  const coach = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': coachAddress },
  });
  const db = new PrismaClient();
  const origin = 'http://localhost:3000';
  const headers = { Origin: origin };
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': traineeAddress });
  try {
    for (const [request, name, email, role] of [
      [coach.request, 'Layout Coach', coachEmail, 'coach'],
      [page.request, 'Layout Trainee', traineeEmail, 'trainee'],
    ] as const) {
      const signup = await request.post(`${origin}/api/auth/sign-up/email`, {
        headers,
        data: { name, email, password: 'Local-Integration-Only-12345' },
      });
      expect(signup.ok()).toBe(true);
      const setup = await request.post(`${origin}/api/command`, {
        headers,
        data: { action: 'onboard', name, role, adult: true },
      });
      expect(setup.ok()).toBe(true);
    }
    const invite = await coach.request.post(`${origin}/api/command`, {
      headers,
      data: { action: 'invite', email: traineeEmail },
    });
    expect(invite.ok()).toBe(true);
    const accepted = await page.request.post('/api/command', {
      headers,
      data: { action: 'acceptInvite', code: (await invite.json()).code },
    });
    expect(accepted.ok()).toBe(true);
    const trainee = await db.user.findUniqueOrThrow({ where: { email: traineeEmail } });
    const created = await coach.request.post(`${origin}/api/command`, {
      headers,
      data: {
        action: 'createClass',
        title: 'Adjustable coach video',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        duration: 30,
        capacity: 2,
        participantIds: [trainee.id],
      },
    });
    expect(created.ok()).toBe(true);
    const session = await created.json();
    const started = await coach.request.post(`${origin}/api/command`, {
      headers,
      data: { action: 'classControl', id: session.id, control: 'start' },
    });
    expect(started.ok()).toBe(true);
    await page.goto(`/studio/${session.id}`);

    const size = page.getByRole('combobox', { name: 'Coach video size' });
    const coachTile = page.locator('.coach-stage');
    const feed = page.locator('#coach-video-feed');
    const analyzer = page.locator('.camera-analyzer');
    await expect(size).toHaveValue('medium');
    await expect(analyzer).toBeVisible();
    // Layout changes must preserve the same camera and feed nodes, rather than remounting them.
    await analyzer.evaluate((node, id) => node.setAttribute('data-layout-fixture', id), fixtureId);
    await feed.evaluate((node, id) => node.setAttribute('data-layout-fixture', id), fixtureId);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1440, height: 900 },
      { width: 3840, height: 2160 },
    ]) {
      await page.setViewportSize(viewport);
      let previousSize = 0;
      for (const value of ['small', 'medium', 'large']) {
        await size.selectOption(value);
        await expect(page.locator('.trainee-video-layout')).toHaveClass(
          new RegExp(`coach-video-${value}`),
        );
        const box = await coachTile.boundingBox();
        expect(box).not.toBeNull();
        const dimension = viewport.width <= 600 ? box!.height : box!.width;
        expect(dimension, `${value} changes the coach tile at ${viewport.width}px`).toBeGreaterThan(
          previousSize,
        );
        previousSize = dimension;
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.y).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
        await expect(analyzer).toHaveAttribute('data-layout-fixture', fixtureId);
        await expect(feed).toHaveAttribute('data-layout-fixture', fixtureId);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
      const cameraBefore = await page.locator('.camera-view').boundingBox();
      await page.getByRole('button', { name: 'Minimize coach video' }).click();
      const restore = page.getByRole('button', { name: 'Restore coach video' });
      await expect(restore).toBeFocused();
      await expect(restore).toHaveAttribute('aria-expanded', 'false');
      await expect(feed).toBeHidden();
      await expect(feed).toHaveAttribute('data-layout-fixture', fixtureId);
      const minimized = await coachTile.boundingBox();
      expect(minimized!.height).toBeLessThanOrEqual(viewport.width >= 2000 ? 64 : 50);
      const cameraAfter = await page.locator('.camera-view').boundingBox();
      if (viewport.width <= 600) expect(cameraAfter!.height).toBeGreaterThan(cameraBefore!.height);
      else expect(cameraAfter!.width).toBeGreaterThan(cameraBefore!.width);
      await restore.press('Enter');
      await expect(page.getByRole('button', { name: 'Minimize coach video' })).toBeFocused();
      await expect(size).toHaveValue('large');
      await expect(feed).toBeVisible();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await size.selectOption('small');
    await page.getByRole('button', { name: 'Minimize coach video' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Restore coach video' })).toBeVisible();
    await expect(feed).toBeHidden();
    const cue = page.locator('.analyzer-cue');
    const cueText = cue.locator('p');
    const fullCue = await cueText.textContent();
    const compactCueBox = await cue.boundingBox();
    const footerBox = await page.locator('.analyzer-footer').boundingBox();
    expect(compactCueBox!.height).toBeLessThanOrEqual(40);
    expect(footerBox!.height).toBeLessThanOrEqual(120);
    const expandCue = page.getByRole('button', { name: 'Expand coaching cue' });
    await expect(expandCue).toHaveAttribute('aria-expanded', 'false');
    await expandCue.click();
    const collapseCue = page.getByRole('button', { name: 'Collapse coaching cue' });
    await expect(collapseCue).toHaveAttribute('aria-expanded', 'true');
    await expect(cueText).toHaveText(fullCue!);
    expect(await cueText.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    await collapseCue.click();
    await expect(expandCue).toHaveAttribute('aria-expanded', 'false');
    expect((await cue.boundingBox())!.height).toBeLessThanOrEqual(40);
    await mkdir('docs/screenshots', { recursive: true });
    await page.screenshot({ path: 'docs/screenshots/compact-trainee-mobile.png' });
    const minimizedAccessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(minimizedAccessibility.violations.map((violation) => violation.id)).toEqual([]);
    await page.getByRole('button', { name: 'Restore coach video' }).click();
    await expect(size).toHaveValue('small');
    await expect(feed).toBeVisible();
    const expandedAccessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(expandedAccessibility.violations.map((violation) => violation.id)).toEqual([]);
  } finally {
    try {
      const users = await db.user.findMany({
        where: { email: { in: [coachEmail, traineeEmail] } },
        select: { id: true },
      });
      const ids = users.map((user) => user.id);
      await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await db.rateLimit.deleteMany({
        where: {
          OR: [
            ...ids.map((id) => ({ key: { contains: `:${id}:` } })),
            { key: { contains: coachAddress } },
            { key: { contains: traineeAddress } },
          ],
        },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await db.$disconnect();
      await coach.close();
    }
  }
});
