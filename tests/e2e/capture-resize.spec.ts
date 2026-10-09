import { chromium, expect, test } from '@playwright/test';

type CaptureResizeEvidence = {
  captures: {
    bitmapWidth: number;
    bitmapHeight: number;
    width: number;
    height: number;
    currentVideoWidth: number;
    currentVideoHeight: number;
  }[];
  renders: {
    bitmapWidth: number;
    bitmapHeight: number;
    canvasWidth: number;
    canvasHeight: number;
    pixel: number[];
  }[];
  resizeCompleted: boolean;
};

test('a delayed camera capture keeps its own dimensions when the source rotates before delivery', async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  // Real video and ImageBitmap capture exercise the orientation race. Only the
  // model measurements are deterministic; this is not a model accuracy test.
  await page.addInitScript(() => {
    const evidence: CaptureResizeEvidence = {
      captures: [],
      renders: [],
      resizeCompleted: false,
    };
    (window as unknown as { captureResize: CaptureResizeEvidence }).captureResize = evidence;
    let source: HTMLCanvasElement;
    navigator.mediaDevices.getUserMedia = async () => {
      source = document.createElement('canvas');
      source.width = 640;
      source.height = 360;
      const context = source.getContext('2d')!;
      const paint = () => {
        context.fillStyle = evidence.resizeCompleted ? '#f97316' : '#2563eb';
        context.fillRect(0, 0, source.width, source.height);
        requestAnimationFrame(paint);
      };
      paint();
      return source.captureStream(30);
    };
    const capture = window.createImageBitmap.bind(window);
    let firstCapture = true;
    window.createImageBitmap = (async (input: ImageBitmapSource, options?: ImageBitmapOptions) => {
      const bitmap = await capture(input, options);
      if (firstCapture && input instanceof HTMLVideoElement) {
        firstCapture = false;
        // The captured landscape bitmap is already immutable. Rotate the live
        // source, then delay delivery until the video advertises portrait size.
        source.width = 360;
        source.height = 640;
        evidence.resizeCompleted = true;
        const deadline = performance.now() + 500;
        while (input.videoWidth !== 360 || input.videoHeight !== 640) {
          if (performance.now() > deadline) throw new Error('Camera resize did not reach video');
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      }
      return bitmap;
    }) as typeof window.createImageBitmap;

    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      image: CanvasImageSource,
      ...args: number[]
    ) {
      Reflect.apply(drawImage, this, [image, ...args]);
      if (this.canvas.classList.contains('pose-canvas') && image instanceof ImageBitmap) {
        evidence.renders.push({
          bitmapWidth: image.width,
          bitmapHeight: image.height,
          canvasWidth: this.canvas.width,
          canvasHeight: this.canvas.height,
          pixel: [...this.getImageData(0, 0, 1, 1).data],
        });
      }
    } as typeof drawImage;

    class CaptureWorkerFixture {
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
        const video = document.querySelector('video')!;
        evidence.captures.push({
          bitmapWidth: data.bitmap!.width,
          bitmapHeight: data.bitmap!.height,
          width: data.width!,
          height: data.height!,
          currentVideoWidth: video.videoWidth,
          currentVideoHeight: video.videoHeight,
        });
        const points = Array.from({ length: 33 }, () => ({
          x: 0.5,
          y: 0.5,
          visibility: 0.95,
          presence: 0.95,
        }));
        for (const side of [0, 1]) {
          points[11 + side] = { ...points[11 + side], x: 0.5 + side * 0.01, y: 0.2 };
          points[23 + side] = { ...points[23 + side], x: 0.5 + side * 0.01, y: 0.4 };
          points[25 + side] = { ...points[25 + side], x: 0.5 + side * 0.01, y: 0.65 };
          points[27 + side] = { ...points[27 + side], x: 0.5 + side * 0.01, y: 0.87 };
        }
        // Return the actual captured image with the worker's measurement
        // contract, exercising the real geometry and frame presentation path.
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                type: 'result',
                poses: [points],
                timestamp: data.timestamp,
                width: data.width,
                height: data.height,
                bitmap: data.bitmap,
              },
            }),
          10,
        );
      }
      terminate() {
        this.onmessage = null;
      }
    }
    window.Worker = CaptureWorkerFixture as unknown as typeof Worker;
  });
  try {
    await page.goto(
      `${process.env.GEEZ_SQUAD_VERIFY_URL || 'http://localhost:3000'}/demo?view=practice`,
    );
    await page.getByRole('button', { name: 'Enable camera' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { captureResize: CaptureResizeEvidence }).captureResize.renders
              .length,
        ),
      )
      .toBeGreaterThanOrEqual(3);
    const evidence = await page.evaluate(
      () => (window as unknown as { captureResize: CaptureResizeEvidence }).captureResize,
    );
    expect(evidence.resizeCompleted).toBe(true);
    expect(evidence.captures[0]).toEqual({
      bitmapWidth: 640,
      bitmapHeight: 360,
      width: 640,
      height: 360,
      currentVideoWidth: 360,
      currentVideoHeight: 640,
    });
    expect(evidence.renders[0]).toMatchObject({
      bitmapWidth: 640,
      bitmapHeight: 360,
      canvasWidth: 640,
      canvasHeight: 360,
    });
    // The first presented image remains the blue landscape capture. New
    // portrait frames then use the orange source without stretching metadata.
    expect(evidence.renders[0].pixel[2]).toBeGreaterThan(200);
    expect(evidence.renders[0].pixel[0]).toBeLessThan(60);
    const portrait = evidence.renders.find((frame) => frame.bitmapWidth === 360)!;
    expect(portrait).toMatchObject({
      bitmapHeight: 640,
      canvasWidth: 360,
      canvasHeight: 640,
    });
    expect(portrait.pixel[0]).toBeGreaterThan(220);
    expect(portrait.pixel[2]).toBeLessThan(60);
    await expect(page.getByText('Pose detected', { exact: true })).toBeVisible();
    await expect(page.getByTestId('cumulative-reps')).toHaveText('00');
    await page.getByRole('button', { name: 'Stop local camera analysis' }).click();
  } finally {
    await browser.close();
  }
});
