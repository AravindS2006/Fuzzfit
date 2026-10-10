import { expect, it } from 'vitest';
import { writeMetrics } from '../src/lib/metrics-write';

it('keeps local writes exclusive and releases the queue even after a failed transaction', async () => {
  let writers = 0,
    maximum = 0,
    completed = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 30 }, (_, index) =>
      writeMetrics(async () => {
        writers++;
        maximum = Math.max(maximum, writers);
        try {
          await new Promise((resolve) => setTimeout(resolve, 1));
          if (index === 3) throw new Error('Invalid summary');
          completed++;
        } finally {
          writers--;
        }
      }, true),
    ),
  );
  expect(maximum).toBe(1);
  expect(completed).toBe(29);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
});
it('retries a database serialization conflict but preserves validation failures', async () => {
  let attempts = 0;
  let rateLimits = 0;
  expect(
    await writeMetrics(
      async () => {
        if (++attempts < 3) throw { code: 'P2034' };
        return 'saved';
      },
      false,
      async () => {
        rateLimits++;
      },
    ),
  ).toBe('saved');
  expect(attempts).toBe(3);
  expect(rateLimits).toBe(1);
  const failure = new Error('No consent');
  await expect(
    writeMetrics(async () => {
      throw failure;
    }, false),
  ).rejects.toBe(failure);
});
