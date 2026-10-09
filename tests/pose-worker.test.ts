import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { it, expect } from 'vitest';
it('recovers one lost GPU runtime through CPU and closes every frame bitmap', async () => {
  const messages: Record<string, unknown>[] = [];
  let created = 0,
    closed = 0,
    bitmaps = 0,
    cpuFailed = false;
  const self = {
    exports: {},
    postMessage: (message: Record<string, unknown>) => messages.push(message),
    onmessage: null as unknown as (event: { data: Record<string, unknown> }) => Promise<void>,
  };
  const scope = {
    self,
    importScripts: () => {
      self.exports = {
        FilesetResolver: { forVisionTasks: async () => ({}) },
        PoseLandmarker: {
          createFromOptions: async (
            _files: unknown,
            options: { baseOptions: { delegate: string } },
          ) => {
            created++;
            return {
              close: () => closed++,
              detectForVideo: () => {
                if (options.baseOptions.delegate === 'GPU' || cpuFailed)
                  throw Error('Lost context');
                return { landmarks: [], worldLandmarks: [] };
              },
            };
          },
        },
      };
    },
    OffscreenCanvas: class {},
    performance: { now: () => 100 },
    console: { error: () => {} },
  };
  vm.runInNewContext(readFileSync('public/pose-worker.js', 'utf8'), scope);
  await self.onmessage({ data: { type: 'init', variant: 'full' } });
  const frame = {
    type: 'frame',
    bitmap: { close: () => bitmaps++ },
    timestamp: 100,
    width: 640,
    height: 480,
  };
  await self.onmessage({ data: frame });
  await self.onmessage({ data: { ...frame, timestamp: 200 } });
  expect(messages.map((message) => message.type)).toEqual(['ready', 'backend', 'result', 'result']);
  expect(messages[1]).toMatchObject({ delegate: 'CPU', variant: 'full' });
  expect(created).toBe(2);
  expect(closed).toBe(1);
  expect(bitmaps).toBe(2);
  cpuFailed = true;
  await self.onmessage({ data: { ...frame, timestamp: 300 } });
  expect(messages.at(-1)?.type).toBe('error');
  expect(created).toBe(2);
  expect(bitmaps).toBe(3);
});
it('transfers the analyzed image back once and leaves closing it to the renderer', async () => {
  const messages: { message: Record<string, unknown>; transfer: unknown[] }[] = [];
  let closed = 0;
  const bitmap = { close: () => closed++ };
  const self = {
    exports: {},
    onmessage: null as unknown as (event: { data: Record<string, unknown> }) => Promise<void>,
    postMessage: (message: Record<string, unknown>, transfer: unknown[] = []) =>
      messages.push({ message, transfer }),
  };
  vm.runInNewContext(readFileSync('public/pose-worker.js', 'utf8'), {
    self,
    importScripts: () => {
      self.exports = {
        FilesetResolver: { forVisionTasks: async () => ({}) },
        PoseLandmarker: {
          createFromOptions: async () => ({
            detectForVideo: () => ({ landmarks: [], worldLandmarks: [] }),
          }),
        },
      };
    },
    performance: { now: () => 0 },
    console,
  });
  await self.onmessage({ data: { type: 'init', variant: 'heavy', cpuOnly: true } });
  await self.onmessage({
    data: { type: 'frame', timestamp: 100, width: 1280, height: 720, bitmap, presentFrame: true },
  });
  expect(messages[1].message).toMatchObject({
    type: 'result',
    bitmap,
    timestamp: 100,
    width: 1280,
    height: 720,
  });
  expect(messages[1].transfer).toEqual([bitmap]);
  expect(closed).toBe(0);
  bitmap.close();
  expect(closed).toBe(1);
});
