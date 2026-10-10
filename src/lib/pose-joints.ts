import type { Landmark } from './pose-engine';

type Point = { x: number; y: number };
type Sample = { offset: Point; length: number; at: number };
export type JointStabilityState = { samples: Map<number, Sample>; width: number; height: number };
export const initialJointStability = (): JointStabilityState => ({
  samples: new Map(),
  width: 0,
  height: 0,
});
const segments = [
  [13, 11],
  [14, 12],
  [15, 13],
  [16, 14],
  [25, 23],
  [26, 24],
  [27, 25],
  [28, 26],
];
const confident = (p: Landmark | undefined) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.min(p.visibility ?? 0, p.presence ?? 1) >= 0.65;

/** Reject isolated limb-length explosions; never move a joint or output an old position. */
export function stabilizePoseJoints(
  state: JointStabilityState,
  poses: Landmark[][],
  world: Landmark[][] | undefined,
  timestamp: number,
  width: number,
  height: number,
) {
  if (state.width !== width || state.height !== height || poses.length !== 1) state.samples.clear();
  state.width = width;
  state.height = height;
  const pose = poses[0];
  if (poses.length !== 1 || !pose || ![11, 12, 23, 24].every((i) => confident(pose[i])))
    return { poses, worldPoses: world, rejectedJoints: 0 };
  const length = (a: Landmark, b: Landmark) =>
    Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const torso = (length(pose[11], pose[23]) + length(pose[12], pose[24])) / 2;
  if (torso < 1) return { poses, worldPoses: world, rejectedJoints: 0 };
  const rejected = new Set<number>();
  for (const [joint, parent] of segments) {
    if (!confident(pose[joint]) || !confident(pose[parent]) || rejected.has(parent)) {
      if (rejected.has(parent)) rejected.add(joint);
      continue;
    }
    const offset = {
      x: (pose[joint].x - pose[parent].x) * width,
      y: (pose[joint].y - pose[parent].y) * height,
    };
    const measured = Math.hypot(offset.x, offset.y);
    const previous = state.samples.get(joint);
    const dt = previous ? timestamp - previous.at : 0;
    if (
      previous &&
      dt > 0 &&
      dt < 200 &&
      previous.length > torso * 0.1 &&
      measured > previous.length * 2.2 &&
      Math.hypot(offset.x - previous.offset.x, offset.y - previous.offset.y) > torso * 0.6
    ) {
      rejected.add(joint);
      continue;
    }
    state.samples.set(joint, { offset, length: measured, at: timestamp });
  }
  if (!rejected.size) return { poses, worldPoses: world, rejectedJoints: 0 };
  // Hands and feet associated with an invalid endpoint must also disappear.
  for (const [endpoint, children] of [
    [15, [17, 19, 21]],
    [16, [18, 20, 22]],
    [27, [29, 31]],
    [28, [30, 32]],
  ] as const)
    if (rejected.has(endpoint)) children.forEach((i) => rejected.add(i));
  const mask = (points: Landmark[]) =>
    points.map((p, i) => (rejected.has(i) ? { ...p, visibility: 0, presence: 0 } : p));
  return { poses: [mask(pose)], worldPoses: world?.map(mask), rejectedJoints: rejected.size };
}
