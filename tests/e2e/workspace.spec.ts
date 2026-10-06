import { test, expect } from '@playwright/test';
test('sample studio supports navigation, plan edits, scheduling, and an isolated live preview', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'A good day to make progress.' })).toBeVisible();
  await expect(
    page.getByText('All client data and history are illustrative.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Workout plans' }).click();
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  await page.getByLabel('Plan name').fill('Controlled strength');
  await page.getByLabel('A little context').fill('Test plan in sample mode.');
  await page.getByRole('button', { name: 'Save workout plan' }).click();
  await expect(page.getByRole('heading', { name: 'Controlled strength' })).toBeVisible();
  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: 'Schedule session', exact: true }).click();
  await page.getByLabel('Session title').fill('Mindful movement');
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: /Ava Thompson/ })
    .check();
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule session' }).click();
  await expect(page.getByText('Mindful movement', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Open studio', exact: true }).first().click();
  await expect(page.getByText('ILLUSTRATIVE STUDIO PREVIEW')).toBeVisible();
  await expect(page.getByText('Illustrative feed').first()).toBeVisible();
  await page.getByLabel('Coaching cue').fill('Move under control.');
  await page.getByRole('button', { name: 'Send class cue' }).click();
  await expect(page.getByText('Move under control.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause class' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('mobile workspace has no horizontal overflow and opens navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'A good day to make progress.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'My clients' }).click();
  await expect(page.getByRole('heading', { name: 'People make the progress.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('camera practice starts only after consented user action and handles denial', async ({
  page,
  context,
}) => {
  await context.grantPermissions([]);
  await page.goto('/demo?view=practice');
  await expect(page.getByRole('button', { name: 'Enable camera' })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('video')?.srcObject === null)).toBe(true);
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Enable camera' })).toBeVisible();
});
