import type { Analysis } from './pose-engine';
import type { ExerciseId } from './types';
import type { WorkoutConfig } from './workout-config';

export type StartCountdown = { remainingMs: number; lastFrameAt: number | null };
export const START_DELAY_MS = 5000;
export const MAX_START_FRAME_GAP_MS = 750;

export function initialStartCountdown(): StartCountdown {
  return { remainingMs: START_DELAY_MS, lastFrameAt: null };
}

// Only consecutive, fresh observations of the starting pose advance this clock.
export function advanceStartCountdown(
  state: StartCountdown,
  ready: boolean,
  timestamp: number,
): StartCountdown {
  if (!ready || !Number.isFinite(timestamp) || timestamp < 0) return initialStartCountdown();
  if (state.lastFrameAt === null) return { remainingMs: START_DELAY_MS, lastFrameAt: timestamp };
  const gap = timestamp - state.lastFrameAt;
  if (!Number.isFinite(gap) || gap <= 0 || gap > MAX_START_FRAME_GAP_MS)
    return initialStartCountdown();
  return { remainingMs: Math.max(0, state.remainingMs - gap), lastFrameAt: timestamp };
}

export function canStartWorkout(
  result: Analysis,
  exercise: ExerciseId,
  config: WorkoutConfig,
): boolean {
  if (
    !result.tracked ||
    !Number.isFinite(result.confidence) ||
    result.confidence < 0.65 ||
    result.confidence > 1 ||
    result.score === null ||
    !Number.isFinite(result.score) ||
    result.score < 75 ||
    result.score > 100 ||
    result.angle === null ||
    !Number.isFinite(result.angle) ||
    result.angle > 180 ||
    !Number.isFinite(config.topAngle)
  )
    return false;
  if (exercise === 'plank') return result.phase === 'holding' && result.angle >= 155;
  return (
    result.angle >= config.topAngle &&
    result.phase === (exercise === 'curl' ? 'arm extended' : 'start position')
  );
}
