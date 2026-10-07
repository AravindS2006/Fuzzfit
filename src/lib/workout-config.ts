import type { Block, ExerciseId } from './types';

export type WorkoutConfig = {
  sets: number;
  target: number;
  rest: number;
  side: 'auto' | 'left' | 'right';
  topAngle: number;
  bottomAngle: number;
  minRepMs: number;
};

export function defaultWorkoutConfig(exercise: ExerciseId, block?: Block): WorkoutConfig {
  return {
    sets: block?.sets ?? 3,
    target: block?.reps ?? (exercise === 'plank' ? 30 : exercise === 'pushup' ? 10 : 12),
    rest: block?.rest ?? 60,
    side: 'auto',
    topAngle: exercise === 'squat' ? 155 : 150,
    bottomAngle: exercise === 'squat' ? 112 : exercise === 'pushup' ? 105 : 65,
    minRepMs: 600,
  };
}

// Saved browser preferences and form fields are untrusted, including non-finite numbers.
export function normalizeWorkoutConfig(
  exercise: ExerciseId,
  input: Partial<WorkoutConfig>,
): WorkoutConfig {
  const defaults = defaultWorkoutConfig(exercise);
  const bounded = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(Math.max(min, Math.min(max, value)))
      : fallback;
  const topAngle = bounded(input.topAngle, defaults.topAngle, 130, 175);
  return {
    sets: bounded(input.sets, defaults.sets, 1, 10),
    target: bounded(input.target, defaults.target, 1, 120),
    rest: bounded(input.rest, defaults.rest, 0, 300),
    side: input.side === 'left' || input.side === 'right' ? input.side : 'auto',
    topAngle,
    bottomAngle: bounded(input.bottomAngle, defaults.bottomAngle, 35, topAngle - 25),
    minRepMs: bounded(input.minRepMs, defaults.minRepMs, 500, 3000),
  };
}
