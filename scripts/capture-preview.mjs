import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
for (const view of ['dashboard', 'practice', 'plans']) {
  await page.goto(`http://localhost:3000/demo?view=${view}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `docs/screenshots/${view}.png`, fullPage: true });
}
await page.goto('http://localhost:3000/demo');
await page.getByRole('button', { name: 'Open studio', exact: true }).first().click();
await page.getByText('ILLUSTRATIVE STUDIO PREVIEW', { exact: true }).waitFor();
await page.screenshot({ path: 'docs/screenshots/studio.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://localhost:3000/demo');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
await browser.close();
console.log('Preview screenshots saved.');
