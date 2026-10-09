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
            if (data.type === 'ready' || data.type === 'backend')
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
      ).toBeVisible({ timeout: 20000 });
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

test('a stalled GPU inference recovers through a real CPU worker without replacing the camera', async () => {
  test.setTimeout(60000);
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const diagnostics = { starts: 0, backend: '' };
    (window as unknown as { poseRecovery: typeof diagnostics }).poseRecovery = diagnostics;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        diagnostics.starts++;
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'ready' || data.type === 'backend') diagnostics.backend = data.delegate;
        });
      }
    };
  });
  await page.route('**/pose-worker.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        'const { FilesetResolver, PoseLandmarker } = self.exports;',
        `const { FilesetResolver, PoseLandmarker } = self.exports;
        const nativeCreate = PoseLandmarker.createFromOptions.bind(PoseLandmarker);
        PoseLandmarker.createFromOptions = async (files, options) => {
          if (options.baseOptions.delegate !== 'GPU') return nativeCreate(files, options);
          return { detectForVideo() {
            const started = performance.now();
            while (performance.now() - started < 30000) { /* blocked GPU inference */ }
            return { landmarks: [], worldLandmarks: [] };
          }, close() {} };
        };`,
      ),
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('http://localhost:3000/demo?view=practice');
    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect(page.getByText('Position camera', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await page.evaluate(() => {
      (window as unknown as { originalCamera: MediaStream | null }).originalCamera =
        document.querySelector('video')?.srcObject as MediaStream;
    });
    await expect(
      page.getByText('Step into view and keep the required joints visible.'),
    ).toBeVisible({ timeout: 20000 });
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { poseRecovery: { starts: number; backend: string } }).poseRecovery,
      ),
    ).toEqual({ starts: 2, backend: 'CPU' });
    expect(
      await page.evaluate(() => {
        const camera = (window as unknown as { originalCamera: MediaStream }).originalCamera;
        return (
          camera === document.querySelector('video')?.srcObject &&
          camera.getVideoTracks().every((track) => track.readyState === 'live')
        );
      }),
    ).toBe(true);
    await expect(page.getByTestId('cumulative-reps')).toHaveText('00');
    await page.getByRole('button', { name: 'Workout settings', exact: true }).click();
    await page.getByText('Adjust tracking with your coach', { exact: true }).click();
    await expect(page.getByText(/Tracking: full · CPU/)).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Stop local camera analysis' }).click();
    expect(await page.evaluate(() => document.querySelector('video')?.srcObject)).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
