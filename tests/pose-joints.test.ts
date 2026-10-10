import { describe, expect, it } from 'vitest';
import { initialJointStability, stabilizePoseJoints } from '../src/lib/pose-joints';
import type { Landmark } from '../src/lib/pose-engine';

function body(): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.95,
    presence: 0.95,
  }));
  for (const [i, x, y] of [
    [11, 0.4, 0.3],
    [12, 0.6, 0.3],
    [23, 0.4, 0.7],
    [24, 0.6, 0.7],
    [13, 0.35, 0.45],
    [14, 0.65, 0.45],
    [15, 0.35, 0.6],
    [16, 0.65, 0.6],
  ])
    points[i] = { ...points[i], x, y };
  return points;
}
describe('isolated landmark spikes', () => {
  it('hides an implausible wrist and its hand without jumping, altering the model output, or erasing the body', () => {
    const state = initialJointStability(),
      original = body();
    stabilizePoseJoints(state, [original], [original], 0, 1280, 720);
    const bad = structuredClone(original);
    bad[15].x = 0.95;
    const snapshot = structuredClone(bad);
    const rejected = stabilizePoseJoints(state, [bad], [bad], 33, 1280, 720);
    expect(rejected.poses[0][15].visibility).toBe(0);
    expect(rejected.poses[0][17].visibility).toBe(0);
    expect(rejected.poses[0][11].visibility).toBe(0.95);
    expect(rejected.worldPoses?.[0][15].visibility).toBe(0);
    expect(bad).toEqual(snapshot);
    expect(stabilizePoseJoints(state, [original], undefined, 66, 1280, 720).rejectedJoints).toBe(0);
  });
  it('allows a fast controlled curl arc and reacquires after an actual camera change', () => {
    const state = initialJointStability(),
      points = body();
    for (let frame = 0; frame < 20; frame++) {
      const p = structuredClone(points),
        angle = (frame * Math.PI) / 19;
      p[15].x = p[13].x + Math.sin(angle) * 0.09;
      p[15].y = p[13].y + Math.cos(angle) * 0.16;
      expect(stabilizePoseJoints(state, [p], undefined, frame * 50, 1280, 720).rejectedJoints).toBe(
        0,
      );
    }
    const moved = body();
    moved[15].x = 0.95;
    expect(stabilizePoseJoints(state, [moved], undefined, 1100, 720, 1280).rejectedJoints).toBe(0);
  });
});
