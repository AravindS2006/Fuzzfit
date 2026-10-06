import { test, expect, chromium } from '@playwright/test';
test('real pose worker loads its pinned model with a simulated camera', async () => {
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('http://localhost:3000/demo?view=practice');
    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect(page.getByText('Position camera', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByText('Step into view and keep the required joints visible.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Stop local camera analysis' }).click();
    await expect(page.getByRole('button', { name: 'Enable camera' })).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('video')?.srcObject === null)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
