import { describe, expect, it } from 'vitest';
import { shouldSubscribe, cameraQuality, COACH_PAGE_SIZE } from '../src/lib/meeting-policy';

describe('large class media delivery', () => {
  const trainees = Array.from({ length: 100 }, (_, i) => `trainee-${i}`);
  it('caps a 30-person overview at thumbnail quality while promoting the selected trainee', () => {
    const policy = {
      isCoach: true,
      coachId: 'coach',
      cameraIds: trainees.slice(0, 30),
      focusId: trainees[2],
    };
    expect(cameraQuality(policy, trainees[0])).toBe(0);
    expect(cameraQuality(policy, trainees[2])).toBe(2);
    expect(cameraQuality({ ...policy, cameraIds: trainees.slice(0, 12) }, trainees[0])).toBe(1);
    expect(cameraQuality({ isCoach: false, coachId: 'coach', cameraIds: [] }, 'coach')).toBe(2);
  });
  it('delivers just the coach camera to each of 30 trainees by default', () => {
    const cameras = ['coach', ...trainees.slice(0, 30)];
    const policy = { isCoach: false, coachId: 'coach', cameraIds: [] };
    expect(cameras.filter((id) => shouldSubscribe(policy, id, 'camera', false))).toEqual(['coach']);
    expect(shouldSubscribe(policy, 'coach', 'screen_share', false)).toBe(true);
    expect(shouldSubscribe(policy, 'trainee-1', 'screen_share', false)).toBe(false);
  });
  it('keeps coach video reception bounded and releases cameras when a page changes', () => {
    const first = {
      isCoach: true,
      coachId: 'coach',
      cameraIds: trainees.slice(0, COACH_PAGE_SIZE),
    };
    const next = { ...first, cameraIds: trainees.slice(COACH_PAGE_SIZE, COACH_PAGE_SIZE * 2) };
    expect(trainees.filter((id) => shouldSubscribe(first, id, 'camera', false))).toHaveLength(36);
    expect(shouldSubscribe(next, trainees[0], 'camera', false)).toBe(false);
    expect(shouldSubscribe(next, trainees[36], 'camera', false)).toBe(true);
    expect(shouldSubscribe(next, trainees[36], 'camera', true)).toBe(false);
    expect(shouldSubscribe(next, trainees[36], 'microphone', false)).toBe(true);
    expect(shouldSubscribe(next, trainees[36], 'microphone', true)).toBe(false);
  });
});
