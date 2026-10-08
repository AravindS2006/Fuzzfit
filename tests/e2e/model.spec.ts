import { test, expect, chromium } from '@playwright/test';
for (const cpuFallback of [false, true]) {
  test(`real Full pose model loads ${cpuFallback ? 'with CPU fallback' : 'with the available backend'}`, async () => {
    test.setTimeout(60000);
    const browser = await chromium.launch({
      channel: 'msedge',
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'ready')
              (window as unknown as { poseBackend: unknown }).poseBackend = data;
          });
        }
      };
    });
    if (cpuFallback) {
      await page.route('**/pose-worker.js', async (route) => {
        const response = await route.fetch();
        // Inject a failed GPU initialization. The fallback then uses the real
        // production model and CPU/WASM initialization without modification.
        await route.fulfill({
          response,
          body: (await response.text()).replace(
            'model = await PoseLandmarker.createFromOptions(files, {',
            "throw new Error('Simulated unavailable GPU delegate');\nmodel = await PoseLandmarker.createFromOptions(files, {",
          ),
        });
      });
    }
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto('http://localhost:3000/demo?view=practice');
      await page.getByRole('button', { name: 'Enable camera' }).click();
      await expect(page.getByText('Position camera', { exact: true })).toBeVisible({
        timeout: 45000,
      });
      await expect(
        page.getByText('Step into view and keep the required joints visible.'),
      ).toBeVisible();
      const backend = await page.evaluate(
        () =>
          (window as unknown as { poseBackend: { variant: string; delegate: string } }).poseBackend,
      );
      expect(backend.variant).toBe('full');
      expect(
        cpuFallback ? backend.delegate === 'CPU' : ['GPU', 'CPU'].includes(backend.delegate),
      ).toBe(true);
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
}
