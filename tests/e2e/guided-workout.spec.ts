import { chromium, expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type PoseFixture = {
  poseAngle: number;
  poseVisible: boolean;
  poseFramesEnabled: boolean;
  terminatedWorkers: number;
};

async function addPoseFixture(page: Page) {
  // Deterministic landmarks exercise the real geometry engine and UI lifecycle.
  // The pinned MediaPipe worker is tested separately with a real WASM model.
  await page.addInitScript(() => {
    const fixture = window as unknown as PoseFixture;
    fixture.poseAngle = 180;
    fixture.poseVisible = true;
    fixture.poseFramesEnabled = true;
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
        if (!fixture.poseFramesEnabled) return;
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                type: 'result',
                poses: fixture.poseVisible ? [points] : [],
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
}

async function changePose(page: Page, change: Partial<PoseFixture>) {
  await page.evaluate((update) => Object.assign(window, update), change);
}

async function moveThroughAngles(page: Page, angles: number[]) {
  // Real camera motion has observed intermediate positions. Teleporting 85° in
  // one 30 FPS frame deliberately triggers the engine's landmark-jump guard.
  for (const poseAngle of angles) {
    await changePose(page, { poseAngle });
    await page.waitForTimeout(75);
  }
}

test('guided sets count only after the hands-free countdown, recover between sets, and retain cumulative reps', async () => {
  test.setTimeout(60000);
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await addPoseFixture(page);
  try {
    await page.goto('http://localhost:3000/demo?view=practice');
    await page.getByRole('button', { name: 'Workout settings', exact: true }).click();
    await page.getByLabel('Sets', { exact: true }).fill('2');
    await page.getByLabel('Reps per set').fill('1');
    await page.getByLabel('Rest (seconds)').fill('1');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect(page.getByText('Pose detected', { exact: true })).toBeVisible();
    const reps = page.getByTestId('cumulative-reps');
    await expect(reps).toHaveText('00');
    await expect(page.getByRole('button', { name: 'Start set', exact: true })).toBeEnabled();
    // Positioning and rehearsing before Start must never increase the workout total.
    await changePose(page, { poseAngle: 95 });
    await page.waitForTimeout(750);
    await changePose(page, { poseAngle: 180 });
    await page.waitForTimeout(500);
    await expect(reps).toHaveText('00');
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    for (let set = 1; set <= 2; set++) {
      await page
        .getByRole('button', { name: set === 1 ? 'Start set' : 'Start next set', exact: true })
        .click();
      await expect(page.getByRole('button', { name: 'Cancel start', exact: true })).toBeVisible();
      await expect(page.getByLabel('Set start countdown')).toContainText('5');
      await expect(reps).toHaveText(String(set - 1).padStart(2, '0'));
      if (set === 1) {
        await page.screenshot({ path: 'docs/screenshots/handsfree-countdown-mobile.png' });
        const countdownAxe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(countdownAxe.violations).toEqual([]);
      }
      await expect(page.getByRole('button', { name: 'Pause set', exact: true })).toBeVisible();
      await expect(page.locator('.phase-text')).toHaveText('start position');
      await moveThroughAngles(page, [165, 145, 125, 105, 95]);
      await expect(page.locator('.phase-text')).toHaveText('lowered');
      await page.waitForTimeout(650);
      await moveThroughAngles(page, [105, 125, 145, 165, 180]);
      await expect(reps).toHaveText(String(set).padStart(2, '0'));
      await page.getByRole('button', { name: 'Workout settings', exact: true }).click();
      await expect(page.locator('.set-results tbody tr')).toHaveCount(set);
      await page.getByRole('button', { name: 'Close dialog' }).click();
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

test('hands-free start waits for a stable starting pose and cancels safely', async () => {
  test.setTimeout(60000);
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await addPoseFixture(page);
  try {
    await page.goto('http://localhost:3000/demo?view=practice');
    await changePose(page, { poseVisible: false });
    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect(page.getByText('Position camera', { exact: true })).toBeVisible();
    const reps = page.getByTestId('cumulative-reps');
    const start = page.getByRole('button', { name: 'Start set', exact: true });
    const cancel = page.getByRole('button', { name: 'Cancel start', exact: true });
    const active = page.getByRole('button', { name: 'Pause set', exact: true });
    // A trainee can arm at the phone before moving back into the camera's view.
    await expect(start).toBeEnabled();
    await start.click();
    await expect(cancel).toBeVisible();
    await expect(active).toHaveCount(0);
    await changePose(page, { poseVisible: true });
    const countdown = page.getByLabel('Set start countdown');
    await expect(countdown).toContainText('5');
    await expect(countdown).toContainText('3');
    await expect(reps).toHaveText('00');
    // Leaving frame resets the full countdown; elapsed wall time cannot start a set.
    await changePose(page, { poseVisible: false });
    await expect(page.getByText('Position camera', { exact: true })).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(cancel).toBeVisible();
    await expect(active).toHaveCount(0);
    await expect(reps).toHaveText('00');
    // A visible but lowered squat is not a valid starting position.
    await changePose(page, { poseVisible: true, poseAngle: 95 });
    await expect(page.getByText('Pose detected', { exact: true })).toBeVisible();
    await page.waitForTimeout(5500);
    await expect(cancel).toBeVisible();
    await expect(active).toHaveCount(0);
    await expect(reps).toHaveText('00');
    await changePose(page, { poseAngle: 180 });
    await expect(countdown).toContainText('5');
    await expect(countdown).toContainText('3');
    await cancel.click();
    await expect(start).toBeEnabled();
    await page.waitForTimeout(3500);
    await expect(active).toHaveCount(0);
    await expect(reps).toHaveText('00');
    // Backgrounding a mobile browser cancels the pending start, rather than
    // starting a workout when the user later returns to the tab.
    await start.click();
    await expect(cancel).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(cancel).toHaveCount(0);
    await expect(active).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(start).toBeEnabled();
    // Changing the selected movement invalidates any pending start, even when
    // the camera stays connected and keeps producing landmarks.
    await start.click();
    await expect(cancel).toBeVisible();
    await page.getByLabel('Exercise to practice').selectOption('plank');
    await expect(cancel).toHaveCount(0);
    await expect(active).toHaveCount(0);
    await expect(reps).toHaveText('0s');
    await page.getByLabel('Exercise to practice').selectOption('squat');
    await expect(start).toBeEnabled();
    await expect(reps).toHaveText('00');
    // Stopping and restarting the camera must not preserve an armed start.
    await start.click();
    await expect(cancel).toBeVisible();
    await expect(countdown).toContainText('3');
    // A stalled worker / frozen camera cannot finish the remaining countdown.
    await changePose(page, { poseFramesEnabled: false });
    await page.waitForTimeout(5500);
    await expect(cancel).toBeVisible();
    await expect(active).toHaveCount(0);
    // Stale landmarks must disappear instead of presenting old posture as live.
    expect(
      await page.locator('.pose-canvas').evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.every((value, index) => index % 4 !== 3 || value === 0);
      }),
    ).toBe(true);
    await changePose(page, { poseFramesEnabled: true });
    await page.getByRole('button', { name: 'Retry tracking', exact: true }).click();
    await expect(start).toBeEnabled();
    await expect(cancel).toHaveCount(0);
    await start.click();
    await expect(cancel).toBeVisible();
    await page.getByRole('button', { name: 'Stop local camera analysis' }).click();
    await expect(page.getByRole('button', { name: 'Enable camera' })).toBeVisible();
    await changePose(page, { poseFramesEnabled: true });
    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect(start).toBeEnabled();
    await expect(cancel).toHaveCount(0);
    await page.waitForTimeout(5500);
    await expect(active).toHaveCount(0);
    await start.click();
    await expect(active).toBeVisible();
    await expect(reps).toHaveText('00');
    expect(
      await page.evaluate(() => (window as unknown as PoseFixture).terminatedWorkers),
    ).toBeGreaterThan(0);
  } finally {
    await browser.close();
  }
});

test('countdown tolerates small posture changes and pauses for a brief tracking dropout', async () => {
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await addPoseFixture(page);
  try {
    await page.goto('http://localhost:3000/demo?view=practice');
    await changePose(page, { poseAngle: 150 });
    await page.getByRole('button', { name: 'Enable camera' }).click();
    const start = page.getByRole('button', { name: 'Start set', exact: true });
    const active = page.getByRole('button', { name: 'Pause set', exact: true });
    const countdown = page.getByLabel('Set start countdown');
    const remaining = countdown.locator('strong');
    const reps = page.getByTestId('cumulative-reps');
    await expect(start).toBeEnabled();
    await start.click();
    // The more forgiving continuation threshold must not weaken initial setup.
    await page.waitForTimeout(1400);
    await expect(countdown).toHaveCount(0);
    await expect(active).toHaveCount(0);
    await changePose(page, { poseAngle: 180 });
    await expect(remaining).toHaveText('5');
    await expect(remaining).toHaveText('3');
    // Five degrees below the configured top angle is ordinary stance movement,
    // not a new exercise or a reason to start another five-second countdown.
    await changePose(page, { poseAngle: 150 });
    await expect(remaining).toHaveText('2');
    await expect(reps).toHaveText('00');
    await changePose(page, { poseVisible: false });
    await expect(page.getByText('Position camera', { exact: true })).toBeVisible();
    await expect(countdown).toContainText('Countdown paused');
    await page.waitForTimeout(500);
    await expect(remaining).toHaveText('2');
    await expect(active).toHaveCount(0);
    await changePose(page, { poseVisible: true, poseAngle: 180 });
    await expect(page.getByText('Pose detected', { exact: true })).toBeVisible();
    // Lost frames consume no countdown time. Returning promptly resumes the
    // remaining two seconds instead of resetting to five or starting early.
    await expect(remaining).toHaveText('2');
    await changePose(page, { poseAngle: 150 });
    await expect(remaining).toHaveText('1');
    await expect(active).toBeVisible();
    await expect(reps).toHaveText('00');
    // Starting during a tolerated stance change still creates a complete rep
    // origin; the first controlled squat is counted normally after Go.
    await moveThroughAngles(page, [135, 120, 105, 95]);
    await expect(page.locator('.phase-text')).toHaveText('lowered');
    await page.waitForTimeout(650);
    await moveThroughAngles(page, [105, 125, 145, 165, 180]);
    await expect(reps).toHaveText('01');
  } finally {
    await browser.close();
  }
});
