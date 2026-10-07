import { describe, expect, it } from 'vitest';
import type { Analysis } from '../src/lib/pose-engine';
import type { ExerciseId } from '../src/lib/types';
import { defaultWorkoutConfig } from '../src/lib/workout-config';
import {
  advanceStartCountdown,
  canStartWorkout,
  initialStartCountdown,
} from '../src/lib/workout-start';

function readyPose(exercise: ExerciseId, change: Partial<Analysis> = {}): Analysis {
  return {
    reps: 0,
    holdSeconds: 0,
    score: 100,
    confidence: 0.95,
    phase:
      exercise === 'plank' ? 'holding' : exercise === 'curl' ? 'arm extended' : 'start position',
    cue: 'Ready',
    angle: 180,
    tracked: true,
    ruleVersion: 'geometry-v2',
    ...change,
  };
}

describe('hands-free set start', () => {
  it('requires five seconds of fresh consecutive ready frames', () => {
    let state = initialStartCountdown();
    expect(state).toEqual({ remainingMs: 5000, lastFrameAt: null });
    state = advanceStartCountdown(state, true, 1000);
    expect(state.remainingMs).toBe(5000);
    for (let timestamp = 1100; timestamp < 6000; timestamp += 100)
      state = advanceStartCountdown(state, true, timestamp);
    expect(state.remainingMs).toBe(100);
    state = advanceStartCountdown(state, true, 6000);
    expect(state.remainingMs).toBe(0);
    expect(advanceStartCountdown(state, true, 6100).remainingMs).toBe(0);
  });

  it('resets the whole countdown when the required pose is lost', () => {
    const first = advanceStartCountdown(initialStartCountdown(), true, 1000);
    const ticking = advanceStartCountdown(first, true, 1500);
    expect(ticking.remainingMs).toBe(4500);
    const reset = advanceStartCountdown(ticking, false, 1600);
    expect(reset).toEqual(initialStartCountdown());
    expect(advanceStartCountdown(reset, true, 1700).remainingMs).toBe(5000);
  });

  it('does not count a camera frame gap greater than 750 milliseconds', () => {
    const first = advanceStartCountdown(initialStartCountdown(), true, 1000);
    const boundary = advanceStartCountdown(first, true, 1750);
    expect(boundary.remainingMs).toBe(4250);
    const reset = advanceStartCountdown(boundary, true, 2501);
    expect(reset).toEqual(initialStartCountdown());
    expect(advanceStartCountdown(reset, true, 2601).remainingMs).toBe(5000);
  });

  it.each([1000, 900, NaN, Infinity, -Infinity])(
    'does not credit duplicate, backwards or invalid timestamps (%s)',
    (timestamp) => {
      const first = advanceStartCountdown(initialStartCountdown(), true, 1000);
      const result = advanceStartCountdown(first, true, timestamp);
      expect(result.remainingMs).toBe(5000);
      expect(Number.isFinite(result.remainingMs)).toBe(true);
    },
  );

  it.each(['squat', 'pushup', 'curl', 'plank'] as const)(
    'accepts the visible aligned starting position for %s',
    (exercise) => {
      const config = defaultWorkoutConfig(exercise);
      expect(canStartWorkout(readyPose(exercise), exercise, config)).toBe(true);
      expect(
        canStartWorkout(
          readyPose(exercise, {
            confidence: 0.65,
            score: 75,
            angle: exercise === 'plank' ? 155 : config.topAngle,
          }),
          exercise,
          config,
        ),
      ).toBe(true);
    },
  );

  it.each([
    { tracked: false },
    { confidence: 0.64 },
    { confidence: NaN },
    { confidence: Infinity },
    { score: null },
    { score: 74 },
    { score: NaN },
    { score: Infinity },
    { angle: null },
    { angle: 95 },
    { angle: NaN },
    { angle: Infinity },
    { phase: 'lowered' },
    { phase: 'find start position' },
  ] satisfies Partial<Analysis>[])('rejects missing or invalid readiness data %j', (change) => {
    expect(
      canStartWorkout(readyPose('squat', change), 'squat', defaultWorkoutConfig('squat')),
    ).toBe(false);
  });

  it('respects the configured top angle instead of accepting any detected pose', () => {
    const config = { ...defaultWorkoutConfig('squat'), topAngle: 165 };
    expect(canStartWorkout(readyPose('squat', { angle: 160 }), 'squat', config)).toBe(false);
    expect(canStartWorkout(readyPose('squat', { angle: 165 }), 'squat', config)).toBe(true);
  });

  it('requires an aligned holding plank rather than an adjusting plank', () => {
    const config = defaultWorkoutConfig('plank');
    expect(canStartWorkout(readyPose('plank', { angle: 154 }), 'plank', config)).toBe(false);
    expect(canStartWorkout(readyPose('plank', { phase: 'adjusting' }), 'plank', config)).toBe(
      false,
    );
  });

  it('requires the exercise-specific ready phase', () => {
    const config = defaultWorkoutConfig('curl');
    expect(canStartWorkout(readyPose('curl', { phase: 'start position' }), 'curl', config)).toBe(
      false,
    );
  });
});
