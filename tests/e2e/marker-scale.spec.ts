import { expect, test } from '@playwright/test';

type MarkerFrame = {
  number: number;
  width: number;
  height: number;
  cssScale: number;
  joints: { x: number; y: number; cssRadius: number; cssOutlineWidth?: number }[];
  bones: { cssWidth: number; color: string }[];
};

type MarkerFixture = {
  markerFrame: MarkerFrame | null;
  markerWorkerStarts: number;
  markerBitmapFrames: number;
};

for (const source of [
  { name: 'portrait phone', width: 720, height: 1280 },
  { name: 'landscape laptop', width: 1280, height: 720 },
]) {
  test(`${source.name} markers stay readable and aligned when the camera tile resizes`, async ({
    page,
  }) => {
    // A genuine video stream and ImageBitmap exercise capture, presentation, and
    // object-fit scaling. Deterministic model output isolates the rendering bug;
    // it does not measure physical pose accuracy or substitute for model tests.
    await page.addInitScript(({ width, height }) => {
      const fixture = window as unknown as MarkerFixture;
      fixture.markerFrame = null;
      fixture.markerWorkerStarts = 0;
      fixture.markerBitmapFrames = 0;
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceContext = sourceCanvas.getContext('2d')!;
      let sourceFrame = 0;
      const paint = () => {
        sourceContext.fillStyle = sourceFrame++ % 2 ? '#243b53' : '#334e68';
        sourceContext.fillRect(0, 0, width, height);
      };
      paint();
      const sourceTimer = window.setInterval(paint, 33);
      const sourceStream = sourceCanvas.captureStream(30);
      sourceStream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(sourceTimer));
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => sourceStream,
      });

      const clear = CanvasRenderingContext2D.prototype.clearRect;
      const arc = CanvasRenderingContext2D.prototype.arc;
      const beginPath = CanvasRenderingContext2D.prototype.beginPath;
      const lineTo = CanvasRenderingContext2D.prototype.lineTo;
      const stroke = CanvasRenderingContext2D.prototype.stroke;
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      const linePaths = new WeakSet<CanvasRenderingContext2D>();
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.classList.contains('pose-canvas')) {
          const rect = this.canvas.getBoundingClientRect();
          fixture.markerFrame = {
            number: (fixture.markerFrame?.number ?? 0) + 1,
            width: this.canvas.width,
            height: this.canvas.height,
            cssScale: Math.min(rect.width / this.canvas.width, rect.height / this.canvas.height),
            joints: [],
            bones: [],
          };
        }
        return clear.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.beginPath = function () {
        linePaths.delete(this);
        return beginPath.call(this);
      };
      CanvasRenderingContext2D.prototype.lineTo = function (...args) {
        linePaths.add(this);
        return lineTo.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (this.canvas.classList.contains('pose-canvas') && fixture.markerFrame) {
          fixture.markerFrame.joints.push({
            x: args[0] / this.canvas.width,
            y: args[1] / this.canvas.height,
            cssRadius: args[2] * fixture.markerFrame.cssScale,
          });
        }
        return arc.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
        if (
          this.canvas.classList.contains('pose-canvas') &&
          linePaths.has(this) &&
          fixture.markerFrame
        ) {
          fixture.markerFrame.bones.push({
            cssWidth: this.lineWidth * fixture.markerFrame.cssScale,
            color: String(this.strokeStyle),
          });
        } else if (this.canvas.classList.contains('pose-canvas') && fixture.markerFrame) {
          const joint = fixture.markerFrame.joints.at(-1);
          if (joint) joint.cssOutlineWidth = this.lineWidth * fixture.markerFrame.cssScale;
        }
        return Reflect.apply(stroke, this, path ? [path] : []);
      };
      CanvasRenderingContext2D.prototype.drawImage = function (
        image: CanvasImageSource,
        ...args: number[]
      ) {
        if (this.canvas.classList.contains('pose-canvas') && image instanceof ImageBitmap)
          fixture.markerBitmapFrames++;
        return Reflect.apply(drawImage, this, [image, ...args]);
      };

      class MarkerWorker {
        onmessage: ((event: { data: unknown }) => void) | null = null;
        onerror = null;
        postMessage(data: {
          type: string;
          variant?: string;
          bitmap?: ImageBitmap;
          timestamp?: number;
          width?: number;
          height?: number;
        }) {
          if (data.type === 'init') {
            fixture.markerWorkerStarts++;
            setTimeout(
              () =>
                this.onmessage?.({
                  data: { type: 'ready', variant: data.variant, delegate: 'CPU' },
                }),
              10,
            );
            return;
          }
          const landmarks = Array.from({ length: 33 }, () => ({
            x: 0.5,
            y: 0.5,
            visibility: 0.95,
            presence: 0.95,
          }));
          for (const side of [0, 1]) {
            const x = side === 0 ? 0.3 : 0.7;
            for (const [joint, y] of [
              [11, 0.2],
              [13, 0.42],
              [15, 0.56],
              [23, 0.65],
              [25, 0.77],
              [27, 0.92],
            ]) {
              landmarks[joint + side] = { x, y, visibility: 0.95, presence: 0.95 };
            }
          }
          setTimeout(() => {
            if (!this.onmessage) {
              data.bitmap?.close();
              return;
            }
            this.onmessage({
              data: {
                type: 'result',
                poses: [landmarks],
                timestamp: data.timestamp,
                width: data.width,
                height: data.height,
                bitmap: data.bitmap,
              },
            });
          }, 10);
        }
        terminate() {
          this.onmessage = null;
        }
      }
      window.Worker = MarkerWorker as unknown as typeof Worker;
    }, source);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `${process.env.GEEZ_SQUAD_VERIFY_URL || 'http://localhost:3000'}/demo?view=practice`,
    );
    await page.getByLabel('Exercise to practice').selectOption('curl');
    await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
    const canvas = page.locator('.pose-canvas');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as MarkerFixture).markerBitmapFrames))
      .toBeGreaterThan(5);
    await canvas.evaluate((node) => node.setAttribute('data-marker-node', 'original'));

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const previousFrame = await page.evaluate(
        () => (window as unknown as MarkerFixture).markerFrame!.number,
      );
      await page.setViewportSize(viewport);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as MarkerFixture).markerFrame!.number))
        .toBeGreaterThan(previousFrame + 5);
      const frame = await page.evaluate(() => (window as unknown as MarkerFixture).markerFrame!);
      expect({ width: frame.width, height: frame.height }).toEqual({
        width: source.width,
        height: source.height,
      });
      expect(frame.cssScale).toBeGreaterThan(0);
      expect(frame.cssScale).toBeLessThan(1);
      expect(frame.joints.length).toBeGreaterThanOrEqual(12);
      const elbow = frame.joints.find(
        (joint) => Math.abs(joint.x - 0.3) < 0.00001 && Math.abs(joint.y - 0.42) < 0.00001,
      );
      expect(elbow).toBeDefined();
      // object-fit: contain can add letterboxing; the smaller axis controls the
      // displayed scale for both X and Y, including the canvas stroke thickness.
      for (const joint of frame.joints) {
        expect(joint.cssRadius).toBeCloseTo(3, 1);
        expect(joint.cssOutlineWidth).toBeCloseTo(1, 1);
      }
      const greenBones = frame.bones.filter((bone) => bone.color === '#cbff65');
      expect(greenBones.length).toBeGreaterThan(8);
      for (const bone of greenBones) expect(bone.cssWidth).toBeCloseTo(2, 1);
      const outlines = frame.bones.filter((bone) => bone.color !== '#cbff65');
      expect(outlines).toHaveLength(greenBones.length);
      for (const bone of outlines) expect(bone.cssWidth).toBeCloseTo(4, 1);
      await expect(canvas).toHaveAttribute('data-marker-node', 'original');
      expect(
        await page.evaluate(() => (window as unknown as MarkerFixture).markerWorkerStarts),
      ).toBe(1);
      await expect(page.getByTestId('cumulative-reps')).toHaveText('00');
    }
    await page.getByRole('button', { name: 'Stop local camera analysis' }).click();
    await expect(page.getByRole('button', { name: 'Enable camera', exact: true })).toBeVisible();
  });
}
