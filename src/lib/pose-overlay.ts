import type { Landmark } from './pose-engine';

type Axis = { raw: number; value: number; velocity: number };
type Joint = { x: Axis; y: Axis };
export type OverlayPoint = { x: number; y: number; opacity: number };
export type PoseOverlayState = {
  joints: (Joint | undefined)[];
  timestamp: number | null;
  width: number;
  height: number;
};

export function initialPoseOverlay(): PoseOverlayState {
  return { joints: [], timestamp: null, width: 0, height: 0 };
}

const alpha = (cutoff: number, seconds: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * seconds));

function smooth(raw: number, previous: Axis | undefined, seconds: number, anchor: boolean): Axis {
  if (!previous || Math.abs(raw - previous.raw) > 0.15) return { raw, value: raw, velocity: 0 };
  // Light One Euro smoothing in units of the image's shorter dimension.
  // Raising the cutoff with speed follows moving joints without fixed-filter lag.
  const velocity =
    previous.velocity + alpha(1, seconds) * ((raw - previous.raw) / seconds - previous.velocity);
  const value =
    previous.value +
    alpha((anchor ? 1.2 : 4) + (anchor ? 10 : 30) * Math.abs(velocity), seconds) *
      (raw - previous.value);
  return { raw, value, velocity };
}

/** Visualization only. Never pass these points to calibration, scoring or rep counting. */
export function updatePoseOverlay(
  state: PoseOverlayState,
  poses: Landmark[][],
  timestamp: number,
  width: number,
  height: number,
): (OverlayPoint | null)[] {
  const validFrame =
    poses.length === 1 &&
    Number.isFinite(timestamp) &&
    timestamp >= 0 &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0;
  if (!validFrame) {
    Object.assign(state, initialPoseOverlay());
    return [];
  }
  const gap = state.timestamp === null ? 0 : timestamp - state.timestamp;
  if (gap <= 0 || gap > 250 || width !== state.width || height !== state.height) state.joints = [];
  state.timestamp = timestamp;
  state.width = width;
  state.height = height;
  const scale = Math.min(width, height);
  const seconds = gap > 0 ? gap / 1000 : 1 / 30;
  return Array.from({ length: 33 }, (_, index) => {
    const point = poses[0][index];
    const confidence = Math.min(point?.visibility ?? 0, point?.presence ?? 1);
    const previous = state.joints[index];
    // Entry/exit hysteresis avoids blinking around a single threshold. A missing,
    // off-screen or genuinely occluded joint disappears immediately; no ghost or
    // extrapolated points are drawn. Other visible joints remain on screen.
    if (
      !point ||
      !Number.isFinite(confidence) ||
      confidence < (previous ? 0.45 : 0.65) ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    ) {
      state.joints[index] = undefined;
      return null;
    }
    const rawX = (point.x * width) / scale;
    const rawY = (point.y * height) / scale;
    const anchor = [11, 12, 23, 24].includes(index);
    // The torso should not respond to prediction noise as aggressively as fast
    // wrists/ankles. Anatomical identity is validated before this display filter.
    const x = smooth(rawX, previous?.x, seconds, anchor);
    const y = smooth(rawY, previous?.y, seconds, anchor);
    const maximumOffset = anchor ? 0.02 : 0.008;
    // Bounds are image-space limits, not a claim of anatomical accuracy. Torso
    // anchors allow 14.4 px at 720p; moving extremities retain their 5.8 px limit.
    const offset = Math.hypot(x.value - rawX, y.value - rawY);
    if (offset > maximumOffset) {
      x.value = rawX + ((x.value - rawX) * maximumOffset) / offset;
      y.value = rawY + ((y.value - rawY) * maximumOffset) / offset;
    }
    state.joints[index] = { x, y };
    return {
      x: (x.value * scale) / width,
      y: (y.value * scale) / height,
      opacity: Math.min(1, Math.max(0.55, 0.55 + (confidence - 0.45) * 2.25)),
    };
  });
}
