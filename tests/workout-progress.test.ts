import { describe, expect, it } from 'vitest';
import { workoutSetProgress } from '../src/lib/workout-progress';

describe('workout set progress', () => {
  it.each(['plank', 'sideplank'] as const)(
    'retains fractional %s time in the baseline',
    (exercise) => {
      const baseline = { reps: 0, holdMs: 900 };
      expect(workoutSetProgress(exercise, 0, 1000, baseline)).toBeCloseTo(0.1);
      expect(workoutSetProgress(exercise, 0, 1900, baseline)).toBe(1);
    },
  );

  it('requires a full second of observed hold time for each successive one-second set', () => {
    const first = { reps: 0, holdMs: 900 };
    expect(workoutSetProgress('plank', 0, 1899, first)).toBeLessThan(1);
    expect(workoutSetProgress('plank', 0, 1900, first)).toBe(1);

    const second = { reps: 0, holdMs: 1900 };
    expect(workoutSetProgress('plank', 0, 2000, second)).toBeCloseTo(0.1);
    expect(workoutSetProgress('plank', 0, 2899, second)).toBeLessThan(1);
    expect(workoutSetProgress('plank', 0, 2900, second)).toBe(1);
  });

  it.each(['squat', 'pushup', 'curl'] as const)(
    'uses completed reps for %s without counting hold time',
    (exercise) => {
      const baseline = { reps: 12, holdMs: 900 };
      expect(workoutSetProgress(exercise, 12, 1900, baseline)).toBe(0);
      expect(workoutSetProgress(exercise, 14, 1900, baseline)).toBe(2);
    },
  );

  it('clamps progress to zero when counters are reset below the baseline', () => {
    const baseline = { reps: 12, holdMs: 900 };
    expect(workoutSetProgress('squat', 0, 0, baseline)).toBe(0);
    expect(workoutSetProgress('plank', 0, 0, baseline)).toBe(0);
  });
});
