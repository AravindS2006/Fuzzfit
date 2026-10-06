import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log(m.text());
});
page.on('pageerror', (e) => console.log(e.message));
await page.goto('http://localhost:3000/demo?view=practice');
await page.getByRole('button', { name: 'Enable camera' }).click();
await page.locator('.tracking-badge, .inline-error').waitFor({ timeout: 20000 });
console.log(await page.locator('.tracking-badge, .inline-error').textContent());
await browser.close();
