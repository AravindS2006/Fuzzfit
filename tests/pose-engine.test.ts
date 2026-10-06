import { describe, expect, it } from 'vitest';
import { analyzePose, initialPoseState, jointAngle, type Landmark } from '../src/lib/pose-engine';
import { commandSchema, metricSchema } from '../src/lib/validation';
function squat(angle: number, width = 640, height = 480): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.95,
    presence: 0.95,
  }));
  const rad = (angle * Math.PI) / 180;
  for (const side of [0, 1]) {
    const x = 0.5 + side * 0.01;
    points[11 + side] = { x, y: 0.2, visibility: 0.95, presence: 0.95 };
    points[23 + side] = { x, y: 0.4, visibility: 0.95, presence: 0.95 };
    points[25 + side] = { x, y: 0.65, visibility: 0.95, presence: 0.95 };
    points[27 + side] = {
      x: x + (Math.sin(rad) * 0.22 * height) / width,
      y: 0.65 - Math.cos(rad) * 0.22,
      visibility: 0.95,
      presence: 0.95,
    };
  }
  return points;
}
function frames(
  state: ReturnType<typeof initialPoseState>,
  angle: number,
  start: number,
  count = 12,
) {
  let result;
  for (let i = 0; i < count; i++)
    result = analyzePose([squat(angle)], 'squat', state, start + i * 100, 640, 480);
  return result!;
}
describe('confidence-aware pose engine', () => {
  it('calculates joint geometry and rejects degenerate points', () => {
    expect(jointAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(90);
    expect(jointAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
  it('corrects normalized landmarks for camera aspect ratio', () => {
    const s = initialPoseState();
    const result = analyzePose([squat(100, 1280, 720)], 'squat', s, 100, 1280, 720);
    expect(result.angle).toBe(100);
    expect(result.tracked).toBe(true);
  });
  it('refuses to score absent, partial, and multiple poses', () => {
    for (const poses of [[], [squat(180).slice(0, 10)], [squat(180), squat(180)]]) {
      const result = analyzePose(poses, 'squat', initialPoseState(), 100, 640, 480);
      expect(result.score).toBeNull();
      expect(result.reps).toBe(0);
    }
  });
  it('rejects hidden required joints', () => {
    const pose = squat(170);
    pose[25].visibility = 0.2;
    pose[26].visibility = 0.2;
    expect(analyzePose([pose], 'squat', initialPoseState(), 100, 640, 480).score).toBeNull();
  });
  it('rejects joints outside the frame', () => {
    const pose = squat(180);
    pose[27].y = 1.2;
    pose[28].y = 1.2;
    expect(analyzePose([pose], 'squat', initialPoseState(), 100, 640, 480).tracked).toBe(false);
  });
  it('rejects non-finite geometry', () => {
    const pose = squat(180);
    pose[25].x = NaN;
    pose[26].x = NaN;
    expect(analyzePose([pose], 'squat', initialPoseState(), 100, 640, 480).score).toBeNull();
  });
  it('rejects non-finite confidence and frame dimensions', () => {
    const pose = squat(180);
    pose[25].visibility = NaN;
    pose[26].visibility = NaN;
    expect(analyzePose([pose], 'squat', initialPoseState(), 100, 640, 480).score).toBeNull();
    expect(analyzePose([squat(180)], 'squat', initialPoseState(), 100, NaN, 480).tracked).toBe(
      false,
    );
  });
  it('requires a side-on view', () => {
    const pose = squat(180);
    pose[11].x = 0.3;
    pose[12].x = 0.7;
    expect(analyzePose([pose], 'squat', initialPoseState(), 100, 640, 480).cue).toContain(
      'side-on',
    );
  });
  it('counts a complete controlled repetition exactly once', () => {
    const state = initialPoseState();
    frames(state, 180, 100);
    frames(state, 95, 1300);
    const result = frames(state, 180, 2500, 20);
    expect(result.reps).toBe(1);
    frames(state, 180, 4500, 20);
    expect(state.reps).toBe(1);
  });
  it('does not count when observation starts at the bottom', () => {
    const state = initialPoseState();
    frames(state, 95, 100);
    expect(frames(state, 180, 1300).reps).toBe(0);
  });
  it('invalidates an in-progress rep after lost tracking', () => {
    const state = initialPoseState();
    frames(state, 180, 100);
    frames(state, 95, 1300);
    analyzePose([], 'squat', state, 2500, 640, 480);
    expect(frames(state, 180, 2600).reps).toBe(0);
  });
  it('invalidates an in-progress rep when paused', () => {
    const state = initialPoseState();
    frames(state, 180, 100);
    frames(state, 95, 1300);
    const result = analyzePose([squat(95)], 'squat', state, 2500, 640, 480, true);
    expect(result.score).toBeNull();
    expect(frames(state, 180, 2600).reps).toBe(0);
  });
  it('rejects stale timestamps and long frame gaps', () => {
    const state = initialPoseState();
    frames(state, 180, 100);
    frames(state, 95, 1300);
    expect(analyzePose([squat(95)], 'squat', state, 1200, 640, 480).score).toBeNull();
    frames(state, 180, 3000);
    frames(state, 95, 4200);
    expect(frames(state, 180, 9000).reps).toBe(0);
  });
  it('keeps scores and confidence in their advertised ranges', () => {
    for (const angle of [30, 60, 90, 120, 150, 180]) {
      const result = analyzePose([squat(angle)], 'squat', initialPoseState(), 100, 640, 480);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
  it('does not count upright standing as plank hold time', () => {
    const state = initialPoseState();
    for (let i = 0; i < 30; i++) analyzePose([squat(180)], 'plank', state, 100 + i * 100, 640, 480);
    expect(state.holdMs).toBe(0);
  });
  it('accumulates observed plank time without inventing time during gaps', () => {
    const state = initialPoseState();
    const pose = squat(180);
    for (const side of [0, 1]) {
      pose[11 + side] = { x: 0.2, y: 0.5, visibility: 0.95, presence: 0.95 };
      pose[23 + side] = { x: 0.5, y: 0.5, visibility: 0.95, presence: 0.95 };
      pose[27 + side] = { x: 0.8, y: 0.5, visibility: 0.95, presence: 0.95 };
    }
    let result;
    for (let i = 0; i < 21; i++)
      result = analyzePose([pose], 'plank', state, 100 + i * 100, 640, 480);
    expect(result!.holdSeconds).toBe(2);
    analyzePose([pose], 'plank', state, 20000, 640, 480);
    expect(state.holdMs).toBe(2000);
  });
  it.each(['curl', 'pushup'] as const)(
    'counts a complete %s using its own phase thresholds',
    (exercise) => {
      const state = initialPoseState();
      const make = (angle: number) => {
        const pose = squat(180);
        const rad = (angle * Math.PI) / 180;
        for (const side of [0, 1]) {
          const x = exercise === 'curl' ? 0.5 + side * 0.01 : 0.2 + side * 0.01;
          const shoulderY = exercise === 'curl' ? 0.2 : 0.4,
            elbowY = exercise === 'curl' ? 0.42 : 0.6;
          pose[11 + side] = { x, y: shoulderY, visibility: 0.95, presence: 0.95 };
          pose[13 + side] = { x, y: elbowY, visibility: 0.95, presence: 0.95 };
          pose[15 + side] = {
            x: x + (Math.sin(rad) * 0.18 * 480) / 640,
            y: elbowY - Math.cos(rad) * 0.18,
            visibility: 0.95,
            presence: 0.95,
          };
          pose[23 + side] = {
            x: exercise === 'curl' ? x : 0.5 + side * 0.01,
            y: exercise === 'curl' ? 0.65 : 0.5,
            visibility: 0.95,
            presence: 0.95,
          };
          pose[27 + side] = { x: 0.8 + side * 0.01, y: 0.6, visibility: 0.95, presence: 0.95 };
        }
        return pose;
      };
      let result;
      for (let i = 0; i < 36; i++) {
        const angle = i < 12 || i >= 24 ? 180 : exercise === 'curl' ? 50 : 95;
        result = analyzePose([make(angle)], exercise, state, 100 + i * 100, 640, 480);
      }
      expect(result!.reps).toBe(1);
      expect(result!.score).toBeGreaterThan(80);
    },
  );
});
describe('API boundary validation', () => {
  it('requires adult consent and prevents arbitrary role values', () => {
    expect(
      commandSchema.safeParse({ action: 'onboard', role: 'admin', name: 'Tester', adult: true })
        .success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ action: 'onboard', role: 'coach', name: 'Tester', adult: false })
        .success,
    ).toBe(false);
  });
  it('rejects unsupported exercises and impossible metrics', () => {
    const metric = {
      classId: 'test',
      exercise: 'squat',
      revision: 0,
      reps: 1,
      holdSeconds: 0,
      score: 90,
      confidence: 0.9,
      phase: 'moving',
      cue: 'Continue',
    };
    expect(metricSchema.safeParse({ ...metric, score: 101 }).success).toBe(false);
    expect(metricSchema.safeParse({ ...metric, confidence: NaN }).success).toBe(false);
    expect(metricSchema.safeParse({ ...metric, exercise: 'deadlift' }).success).toBe(false);
  });
});
