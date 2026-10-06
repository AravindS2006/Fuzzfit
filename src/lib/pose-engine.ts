import type { ExerciseId } from './types';
export const RULE_VERSION = 'geometry-v1';
export type Landmark = { x: number; y: number; z?: number; visibility?: number; presence?: number };
export type Analysis = {
  reps: number;
  holdSeconds: number;
  score: number | null;
  confidence: number;
  phase: string;
  cue: string;
  angle: number | null;
  tracked: boolean;
  ruleVersion: string;
};
export type PoseState = {
  reps: number;
  holdMs: number;
  stage: 'seek' | 'ready' | 'working';
  candidate: string;
  candidateSince: number;
  startedAt: number;
  lastTimestamp: number;
  smoothAngle: number | null;
  side: number | null;
  lastRepAt: number;
};
export function initialPoseState(): PoseState {
  return {
    reps: 0,
    holdMs: 0,
    stage: 'seek',
    candidate: '',
    candidateSince: 0,
    startedAt: 0,
    lastTimestamp: 0,
    smoothAngle: null,
    side: null,
    lastRepAt: -10000,
  };
}
type Point = { x: number; y: number };
export function jointAngle(a: Point, b: Point, c: Point): number | null {
  const u = { x: a.x - b.x, y: a.y - b.y },
    v = { x: c.x - b.x, y: c.y - b.y };
  const denom = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (!Number.isFinite(denom) || denom < 0.0001) return null;
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / denom))) * 180) / Math.PI;
}
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
function invalid(state: PoseState, cue: string, confidence = 0): Analysis {
  state.stage = 'seek';
  state.candidate = '';
  state.smoothAngle = null;
  state.side = null;
  state.lastTimestamp = 0;
  return {
    reps: state.reps,
    holdSeconds: Math.floor(state.holdMs / 1000),
    score: null,
    confidence,
    phase: 'position camera',
    cue,
    angle: null,
    tracked: false,
    ruleVersion: RULE_VERSION,
  };
}
export function analyzePose(
  poses: Landmark[][],
  exercise: ExerciseId,
  state: PoseState,
  timestamp: number,
  width: number,
  height: number,
  paused = false,
): Analysis {
  if (paused) return invalid(state, 'Tracking paused. Resume when you are ready.');
  if (!Number.isFinite(timestamp) || (state.lastTimestamp && timestamp <= state.lastTimestamp))
    return invalid(state, 'Waiting for a fresh camera frame.');
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !poses.length
  )
    return invalid(state, 'Step into view and keep the required joints visible.');
  if (poses.length !== 1) return invalid(state, 'One person at a time. Clear the camera view.');
  const p = poses[0];
  if (p.length < 33) return invalid(state, 'Waiting for a complete pose.');
  const needed =
    exercise === 'squat'
      ? [11, 23, 25, 27]
      : exercise === 'pushup'
        ? [11, 13, 15, 23, 27]
        : exercise === 'curl'
          ? [11, 13, 15, 23]
          : [11, 23, 27];
  const confidenceFor = (side: number) =>
    Math.min(
      ...needed.map((i) => {
        const point = p[i + side];
        return point &&
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= 0.015 &&
          point.x <= 0.985 &&
          point.y >= 0.015 &&
          point.y <= 0.985
          ? Math.min(point.visibility ?? 0, point.presence ?? 1)
          : 0;
      }),
    );
  const left = confidenceFor(0),
    right = confidenceFor(1);
  const side = left >= right ? 0 : 1;
  const confidence = Math.max(left, right);
  if (!Number.isFinite(confidence) || confidence < 0.65)
    return invalid(
      state,
      'Improve lighting and keep all required joints in frame.',
      Number.isFinite(confidence) ? confidence : 0,
    );
  if (state.side !== null && state.side !== side && Math.abs(left - right) > 0.15)
    return invalid(state, 'Camera view changed. Return to your starting position.', confidence);
  state.side = side;
  const point = (index: number): Point => ({
    x: p[index + side].x * width,
    y: p[index + side].y * height,
  });
  const shoulder = point(11),
    hip = point(23),
    ankle = point(27);
  const torsoLength = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  const shoulderWidth = Math.hypot((p[11].x - p[12].x) * width, (p[11].y - p[12].y) * height);
  if (torsoLength < height * 0.04)
    return invalid(state, 'Move closer so your body landmarks are clear.', confidence);
  if (
    (p[11].visibility ?? 0) > 0.3 &&
    (p[12].visibility ?? 0) > 0.3 &&
    shoulderWidth / torsoLength > 0.75
  )
    return invalid(state, 'Turn side-on to the camera for this exercise.', confidence);
  const raw =
    exercise === 'squat'
      ? jointAngle(hip, point(25), ankle)
      : exercise === 'curl' || exercise === 'pushup'
        ? jointAngle(shoulder, point(13), point(15))
        : jointAngle(shoulder, hip, ankle);
  if (raw === null)
    return invalid(state, 'Reposition the camera; joint geometry is unclear.', confidence);
  const gap = state.lastTimestamp ? timestamp - state.lastTimestamp : 0;
  if (gap > 750) {
    state.stage = 'seek';
    state.candidate = '';
    state.smoothAngle = null;
  }
  const angle = state.smoothAngle === null ? raw : state.smoothAngle * 0.55 + raw * 0.45;
  state.smoothAngle = angle;
  let score: number, cue: string, phase: string;
  if (exercise === 'plank') {
    const horizontal = Math.abs(
      (Math.atan2(ankle.y - shoulder.y, ankle.x - shoulder.x) * 180) / Math.PI,
    );
    const flat = Math.min(horizontal, 180 - horizontal) < 45;
    if (!flat) return invalid(state, 'Move into a side-on plank position.', confidence);
    score = clamp(100 - Math.max(0, 175 - angle) * 2.2);
    cue =
      angle < 155
        ? 'Ask your coach to help align your hips with shoulders and ankles.'
        : 'Hold steady and breathe comfortably.';
    phase = angle >= 155 ? 'holding' : 'adjusting';
    if (angle >= 155 && gap > 0 && gap <= 750) state.holdMs += gap;
  } else {
    const high = exercise === 'squat' ? 157 : 150;
    const low = exercise === 'squat' ? 112 : exercise === 'pushup' ? 105 : 65;
    const candidate = angle >= high ? 'top' : angle <= low ? 'bottom' : 'moving';
    if (candidate !== state.candidate) {
      state.candidate = candidate;
      state.candidateSince = timestamp;
    }
    const stable = timestamp - state.candidateSince >= 180;
    if (candidate === 'top' && stable) {
      if (
        state.stage === 'working' &&
        timestamp - state.startedAt >= 800 &&
        timestamp - state.lastRepAt >= 800
      ) {
        state.reps += 1;
        state.lastRepAt = timestamp;
      }
      state.stage = 'ready';
    }
    if (candidate === 'bottom' && stable && state.stage === 'ready') {
      state.stage = 'working';
      state.startedAt = timestamp;
    }
    phase =
      state.stage === 'seek'
        ? 'find start position'
        : candidate === 'top'
          ? exercise === 'curl'
            ? 'arm extended'
            : 'start position'
          : candidate === 'bottom'
            ? exercise === 'curl'
              ? 'curled'
              : 'lowered'
            : 'moving';
    score = 90;
    cue =
      state.stage === 'seek'
        ? 'Begin at the extended starting position.'
        : 'Move steadily through a comfortable range.';
    if (exercise === 'squat') {
      const lean =
        (Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(shoulder.y - hip.y)) * 180) / Math.PI;
      score = clamp(95 - Math.max(0, lean - 45) * 1.3);
      if (lean > 60) cue = 'Check your trunk position with your coach before continuing.';
      else if (candidate === 'bottom') cue = 'Return to standing under control.';
    } else if (exercise === 'pushup') {
      const alignment = jointAngle(shoulder, hip, ankle);
      const bodySlope = Math.abs(
        (Math.atan2(ankle.y - shoulder.y, ankle.x - shoulder.x) * 180) / Math.PI,
      );
      if (Math.min(bodySlope, 180 - bodySlope) > 55)
        return invalid(state, 'Move into a side-on push-up position.', confidence);
      if (alignment === null)
        return invalid(state, 'Keep shoulders, hips, and ankles visible.', confidence);
      score = clamp(100 - Math.max(0, 175 - alignment) * 2);
      if (alignment < 155) cue = 'Keep your shoulders, hips, and ankles in a steadier line.';
    } else {
      const elbow = point(13);
      const upperArmLean =
        (Math.atan2(Math.abs(elbow.x - shoulder.x), Math.abs(elbow.y - shoulder.y)) * 180) /
        Math.PI;
      score = clamp(95 - Math.max(0, upperArmLean - 20) * 1.5);
      if (upperArmLean > 35) cue = 'Keep your upper arm steadier and reduce the weight if needed.';
    }
  }
  state.lastTimestamp = timestamp;
  return {
    reps: state.reps,
    holdSeconds: Math.floor(state.holdMs / 1000),
    score,
    confidence,
    phase,
    cue,
    angle: Math.round(angle),
    tracked: true,
    ruleVersion: RULE_VERSION,
  };
}
export const skeletonConnections = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [28, 30],
  [30, 32],
];
