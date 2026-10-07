import type { ExerciseId } from './types';

export function workoutSetProgress(
  exercise: ExerciseId,
  reps: number,
  holdMs: number,
  baseline: { reps: number; holdMs: number },
): number {
  // Keep observed hold time precise until presentation so each set gets its full target.
  return Math.max(
    0,
    exercise === 'plank' ? (holdMs - baseline.holdMs) / 1000 : reps - baseline.reps,
  );
}
