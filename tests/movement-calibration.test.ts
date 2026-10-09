import { expect, it } from 'vitest';
import {
  beginMovementCalibration,
  advanceMovementCalibration,
} from '../src/lib/movement-calibration';
import type { Analysis } from '../src/lib/pose-engine';
const sample = (angle: number): Analysis => ({
  reps: 0,
  holdSeconds: 0,
  score: 95,
  confidence: 0.95,
  phase: 'moving',
  cue: '',
  angle,
  tracked: true,
  ruleVersion: 'profile-v4',
  geometrySource: '3d',
  trackedSide: 'right',
});
it('calibrates two stable endpoints after stepping back without counting a workout', () => {
  let state = beginMovementCalibration(100);
  state = advanceMovementCalibration(state, sample(150), 2000, 'curl');
  expect(state.phase).toBe('step-back');
  for (let t = 3100; t <= 4500; t += 100)
    state = advanceMovementCalibration(state, sample(150), t, 'curl');
  expect(state.phase).toBe('end');
  for (let t = 4600; t <= 6000; t += 100)
    state = advanceMovementCalibration(state, sample(95), t, 'curl');
  expect(state.phase).toBe('complete');
  expect(state.range).toEqual({ topAngle: 146, bottomAngle: 99 });
});
it('cannot calibrate from jitter, low confidence, or a partial motion', () => {
  let state = beginMovementCalibration(0);
  for (let t = 3000; t <= 6000; t += 100)
    state = advanceMovementCalibration(state, sample(t % 200 ? 170 : 140), t, 'curl');
  expect(state.phase).toBe('start');
  for (let t = 6100; t <= 8000; t += 100)
    state = advanceMovementCalibration(state, { ...sample(160), confidence: 0.5 }, t, 'curl');
  expect(state.startAngle).toBeNull();
  for (let t = 8100; t <= 9500; t += 100)
    state = advanceMovementCalibration(state, sample(160), t, 'curl');
  for (let t = 9600; t <= 11500; t += 100)
    state = advanceMovementCalibration(state, sample(140), t, 'curl');
  expect(state.phase).toBe('end');
  expect(state.range).toBeUndefined();
});
it('rejects a changed limb or geometry and expires without applying a range', () => {
  let state = beginMovementCalibration(0);
  state = advanceMovementCalibration(state, sample(160), 3000, 'curl');
  expect(
    advanceMovementCalibration(state, { ...sample(150), trackedSide: 'left' }, 3100, 'curl').phase,
  ).toBe('failed');
  expect(
    advanceMovementCalibration(state, { ...sample(150), geometrySource: '2d' }, 3100, 'curl').phase,
  ).toBe('failed');
  expect(advanceMovementCalibration(state, sample(160), 46000, 'curl').phase).toBe('failed');
});
