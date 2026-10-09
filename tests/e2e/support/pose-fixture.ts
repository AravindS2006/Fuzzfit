import type { Page } from '@playwright/test';
export type PoseFixture = {
  poseAngle: number;
  poseVisible: boolean;
  poseFramesEnabled: boolean;
  terminatedWorkers: number;
};

export async function addPoseFixture(page: Page) {
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

export async function changePose(page: Page, change: Partial<PoseFixture>) {
  await page.evaluate((update) => Object.assign(window, update), change);
}

export async function moveThroughAngles(page: Page, angles: number[]) {
  // Real camera motion has observed intermediate positions. Teleporting 85° in
  // one 30 FPS frame deliberately triggers the engine's landmark-jump guard.
  for (const poseAngle of angles) {
    await changePose(page, { poseAngle });
    await page.waitForTimeout(75);
  }
}
