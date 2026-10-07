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
test('mobile navigation closes with its close button, backdrop, Escape, and Settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'A good day to make progress.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('button', { name: 'Dismiss navigation' })
    .click({ position: { x: 340, y: 100 } });
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'My clients' }).click();
  await expect(page.getByRole('heading', { name: 'People make the progress.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('exercise instructions and configurable targets are available before camera permission', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo?view=practice');
  await expect(page.getByRole('region', { name: 'How to do this exercise' })).toBeVisible();
  await expect(
    page.getByText('Stand tall, feet about shoulder-width apart.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Sets', { exact: true }).fill('2');
  await page.getByLabel('Reps per set').fill('8');
  await page.getByLabel('Rest (seconds)').fill('30');
  await expect(page.getByRole('button', { name: 'Start set', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('Sets', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Reps per set')).toHaveValue('8');
  await page.getByLabel('Exercise to practice').selectOption('plank');
  await expect(page.getByLabel('Seconds per set')).toHaveValue('30');
  await expect(
    page.getByText('Only time observed in alignment counts.', { exact: false }),
  ).toBeVisible();
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
