import { describe, expect, it } from 'vitest';
import { initialPoseOverlay, updatePoseOverlay } from '../src/lib/pose-overlay';
import type { Landmark } from '../src/lib/pose-engine';

const W = 1280,
  H = 720;
const pose = (): Landmark[] =>
  Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.95,
    presence: 0.95,
  }));

describe('pose visualization independent of exercise scoring', () => {
  it.each([10, 30, 60])(
    'suppresses shoulder and hip jitter at %i FPS without freezing movement',
    (fps) => {
      const state = initialPoseOverlay();
      const points = pose();
      const errors: number[] = [];
      for (let frame = 0; frame < 120; frame++) {
        for (const index of [11, 12, 23, 24]) points[index].x = 0.5 + (frame % 2 ? 12 : -12) / W;
        const drawn = updatePoseOverlay(state, [points], (frame * 1000) / fps, W, H);
        if (frame > 20) errors.push(Math.abs(drawn[11]!.x - 0.5) * W);
      }
      expect(errors.reduce((sum, value) => sum + value, 0) / errors.length).toBeLessThan(6);
      points[11].x = 0.6;
      const moved = updatePoseOverlay(state, [points], 120000 / fps, W, H)[11]!;
      expect(moved.x).toBeGreaterThan(0.58);
      expect(Math.abs(moved.x - points[11].x) * W).toBeLessThanOrEqual(14.401);
    },
  );

  it.each([10, 30, 60])('reduces stationary joint jitter at %i FPS', (fps) => {
    const state = initialPoseOverlay();
    const points = pose();
    const errors: number[] = [];
    for (let frame = 0; frame < 120; frame++) {
      points[16].x = 0.5 + (frame % 2 ? 0.003 : -0.003);
      const drawn = updatePoseOverlay(state, [points], (frame * 1000) / fps, W, H)[16]!;
      if (frame > 20) errors.push(Math.abs(drawn.x - 0.5));
    }
    expect(errors.reduce((sum, value) => sum + value, 0) / errors.length).toBeLessThan(0.0024);
  });

  it.each([10, 30, 60])(
    'keeps rapid movement within 5.8 px of the current frame at %i FPS',
    (fps) => {
      const state = initialPoseOverlay();
      const points = pose();
      for (let frame = 0; frame < 40; frame++) {
        points[16].x = 0.3 + Math.sin(frame * 0.3) * 0.2;
        points[16].y = 0.5 + Math.cos(frame * 0.3) * 0.2;
        const drawn = updatePoseOverlay(state, [points], (frame * 1000) / fps, W, H)[16]!;
        const lag = Math.hypot((drawn.x - points[16].x) * W, (drawn.y - points[16].y) * H);
        expect(lag).toBeLessThanOrEqual(5.761);
      }
    },
  );

  it('keeps reliable body points when a required exercise joint is occluded, without inventing that joint', () => {
    const state = initialPoseOverlay();
    const points = pose();
    updatePoseOverlay(state, [points], 0, W, H);
    points[27].visibility = 0.1;
    const drawn = updatePoseOverlay(state, [points], 33, W, H);
    expect(drawn[27]).toBeNull();
    expect(drawn[11]).not.toBeNull();
    expect(drawn[23]).not.toBeNull();
    expect(drawn[25]).not.toBeNull();
  });

  it('uses separate visibility entry and exit thresholds without retaining a truly lost joint', () => {
    const state = initialPoseOverlay();
    const points = pose();
    for (const [index, visibility] of [0.66, 0.64, 0.63, 0.46, 0.44, 0.64, 0.66].entries()) {
      points[16].visibility = visibility;
      const drawn = updatePoseOverlay(state, [points], index * 33, W, H)[16];
      expect(drawn !== null).toBe(![4, 5].includes(index));
      if (index === 3) expect(drawn!.opacity).toBeLessThan(0.6);
    }
  });

  it('checks presence and finite, on-screen coordinates per joint', () => {
    const state = initialPoseOverlay();
    const points = pose();
    points[11].presence = 0.1;
    points[12].x = NaN;
    points[13].y = Infinity;
    points[14].x = -0.1;
    points[15].y = 1.1;
    const drawn = updatePoseOverlay(state, [points], 0, W, H);
    expect(drawn.slice(11, 16)).toEqual(Array(5).fill(null));
    expect(drawn[23]).not.toBeNull();
  });
  it('hides a relocating low-confidence wrist while preserving the torso and reacquiring a reliable wrist', () => {
    const state = initialPoseOverlay(),
      points = pose();
    updatePoseOverlay(state, [points], 0, W, H);
    points[16].visibility = 0.5;
    points[16].x = 0.8;
    const uncertain = updatePoseOverlay(state, [points], 33, W, H);
    expect(uncertain[16]).toBeNull();
    expect(uncertain[11]).not.toBeNull();
    points[16].visibility = 0.95;
    expect(updatePoseOverlay(state, [points], 66, W, H)[16]?.x).toBe(0.8);
  });

  it('clears the previous person immediately after an empty or ambiguous detection', () => {
    const state = initialPoseOverlay();
    const points = pose();
    updatePoseOverlay(state, [points], 0, W, H);
    expect(updatePoseOverlay(state, [], 33, W, H)).toEqual([]);
    expect(state.joints).toEqual([]);
    updatePoseOverlay(state, [points], 66, W, H);
    expect(updatePoseOverlay(state, [points, points], 99, W, H)).toEqual([]);
    expect(state.joints).toEqual([]);
  });

  it.each(['gap', 'backwards', 'dimensions'] as const)(
    'reacquires confidence instead of bridging a %s change',
    (change) => {
      const state = initialPoseOverlay();
      const points = pose();
      updatePoseOverlay(state, [points], 100, W, H);
      points[16].visibility = 0.6;
      const result = updatePoseOverlay(
        state,
        [points],
        change === 'gap' ? 400 : change === 'backwards' ? 99 : 133,
        change === 'dimensions' ? 720 : W,
        H,
      );
      expect(result[16]).toBeNull();
    },
  );

  it('does not interpolate through a large landmark relocation or mutate model measurements', () => {
    const state = initialPoseOverlay();
    const points = pose();
    updatePoseOverlay(state, [points], 0, W, H);
    points[16].x = 0.8;
    const original = structuredClone(points);
    const result = updatePoseOverlay(state, [points], 33, W, H);
    expect(result[16]!.x).toBeCloseTo(0.8);
    expect(points).toEqual(original);
  });

  it.each([NaN, Infinity, -1])('rejects an invalid frame timestamp %s', (timestamp) => {
    expect(updatePoseOverlay(initialPoseOverlay(), [pose()], timestamp, W, H)).toEqual([]);
  });
});
