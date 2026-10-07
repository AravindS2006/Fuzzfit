import { chromium, expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('guided sets count only after Start, recover between sets, and retain cumulative reps', async () => {
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // Deterministic landmarks exercise the real geometry engine and UI lifecycle.
  // The pinned MediaPipe worker is tested separately with a real WASM model.
  await page.addInitScript(() => {
    const fixture = window as unknown as { poseAngle: number; terminatedWorkers: number };
    fixture.poseAngle = 180;
    fixture.terminatedWorkers = 0;
    class PoseWorkerFixture {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      postMessage(data: {
        type: string;
        bitmap?: ImageBitmap;
        timestamp?: number;
        width?: number;
        height?: number;
      }) {
        if (data.type === 'init') {
          setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 20);
          return;
        }
        const points = Array.from({ length: 33 }, () => ({
          x: 0.5,
          y: 0.5,
          visibility: 0.95,
          presence: 0.95,
        }));
        const rad = (fixture.poseAngle * Math.PI) / 180;
        for (const side of [0, 1]) {
          const x = 0.5 + side * 0.01;
          points[11 + side] = { x, y: 0.2, visibility: 0.95, presence: 0.95 };
          points[23 + side] = { x, y: 0.4, visibility: 0.95, presence: 0.95 };
          points[25 + side] = { x, y: 0.65, visibility: 0.95, presence: 0.95 };
          points[27 + side] = {
            x: x + (Math.sin(rad) * 0.22 * data.height!) / data.width!,
            y: 0.65 - Math.cos(rad) * 0.22,
            visibility: 0.95,
            presence: 0.95,
          };
        }
        data.bitmap?.close();
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                type: 'result',
                poses: [points],
                timestamp: data.timestamp,
                width: data.width,
                height: data.height,
              },
            }),
          10,
        );
      }
      terminate() {
        this.onmessage = null;
        fixture.terminatedWorkers++;
      }
    }
    window.Worker = PoseWorkerFixture as unknown as typeof Worker;
  });
  try {
    await page.goto('http://localhost:3000/demo?view=practice');
    await page.getByLabel('Sets', { exact: true }).fill('2');
    await page.getByLabel('Reps per set').fill('1');
    await page.getByLabel('Rest (seconds)').fill('1');
    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect(page.getByText('Pose detected', { exact: true })).toBeVisible();
    const reps = page.locator('.analysis-strip > div').first().locator('strong');
    await expect(reps).toHaveText('00');
    await expect(page.getByRole('button', { name: 'Start set', exact: true })).toBeEnabled();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    for (let set = 1; set <= 2; set++) {
      await page
        .getByRole('button', { name: set === 1 ? 'Start set' : 'Start next set', exact: true })
        .click();
      await expect(page.getByText('start position', { exact: true })).toBeVisible();
      await page.evaluate(() => {
        (window as unknown as { poseAngle: number }).poseAngle = 95;
      });
      await expect(page.getByText('lowered', { exact: true })).toBeVisible();
      await page.waitForTimeout(650);
      await page.evaluate(() => {
        (window as unknown as { poseAngle: number }).poseAngle = 180;
      });
      await expect(reps).toHaveText(String(set).padStart(2, '0'));
      await expect(page.locator('.set-results tbody tr')).toHaveCount(set);
    }
    await expect(page.getByText('Workout complete', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop local camera analysis' }).click();
    await expect(page.getByRole('button', { name: 'Enable camera' })).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { terminatedWorkers: number }).terminatedWorkers,
      ),
    ).toBeGreaterThan(0);
  } finally {
    await browser.close();
  }
});
