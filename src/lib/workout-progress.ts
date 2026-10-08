import type { ExerciseId } from './types';
import { isHoldExercise } from './exercise-profiles';

export function workoutSetProgress(
  exercise: ExerciseId,
  reps: number,
  holdMs: number,
  baseline: { reps: number; holdMs: number },
): number {
  // Keep observed hold time precise until presentation so each set gets its full target.
  return Math.max(
    0,
    isHoldExercise(exercise) ? (holdMs - baseline.holdMs) / 1000 : reps - baseline.reps,
  );
}
