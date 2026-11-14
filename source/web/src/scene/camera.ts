import type { SessionInfo, Vec3 } from '../domain/types';

export interface CameraView {
  readonly position: Vec3;
  readonly target: Vec3;
}

const MIN_RADIUS = 1.5;
const TARGET_HEIGHT_ABOVE_FLOOR = 0.8;

/** A three-quarter view from the front right and above, looking at the middle of the play areas. */
export function defaultCameraView(session: SessionInfo | null): CameraView {
  const floor = session?.floorHeight ?? 0;
  const corners = session?.playAreas.flatMap((area) => area.corners) ?? [];

  let centerX = 0;
  let centerZ = 0;
  if (corners.length > 0) {
    for (const corner of corners) {
      centerX += corner[0];
      centerZ += corner[2];
    }
    centerX /= corners.length;
    centerZ /= corners.length;
  }

  let radius = MIN_RADIUS;
  for (const corner of corners) radius = Math.max(radius, Math.hypot(corner[0] - centerX, corner[2] - centerZ));

  const target: Vec3 = [centerX, floor + TARGET_HEIGHT_ABOVE_FLOOR, centerZ];
  // Far enough to hold the whole play area and base stations mounted above head height.
  const position: Vec3 = [centerX + radius * 1.5, target[1] + radius * 1.2, centerZ + radius * 2.3];
  return { position, target };
}

/** Slow at the end: 0 at 0, 1 at 1. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * A view `t` of the way from `from` to `to` (0 to 1, already eased). The camera swings around its target like a
 * user's drag would: heading turns the short way round, distance changes in proportion, the target moves in a line.
 * Going straight from one position to the other would cut through the middle of the scene.
 */
export function interpolateView(from: CameraView, to: CameraView, t: number): CameraView {
  const a = orbitOf(from);
  const b = orbitOf(to);
  const turn = ((((b.yaw - a.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const yaw = a.yaw + turn * t;
  const pitch = a.pitch + (b.pitch - a.pitch) * t;
  const distance = Math.exp(Math.log(a.distance) + (Math.log(b.distance) - Math.log(a.distance)) * t);
  const target: Vec3 = [
    from.target[0] + (to.target[0] - from.target[0]) * t,
    from.target[1] + (to.target[1] - from.target[1]) * t,
    from.target[2] + (to.target[2] - from.target[2]) * t,
  ];
  const flat = Math.cos(pitch) * distance;
  const position: Vec3 = [
    target[0] + Math.sin(yaw) * flat,
    target[1] + Math.sin(pitch) * distance,
    target[2] + Math.cos(yaw) * flat,
  ];
  return { position, target };
}

/** Heading around +Y (0 looks along -Z from +Z), elevation above the horizon, and distance of a view. */
function orbitOf(view: CameraView): { yaw: number; pitch: number; distance: number } {
  const x = view.position[0] - view.target[0];
  const y = view.position[1] - view.target[1];
  const z = view.position[2] - view.target[2];
  const distance = Math.max(Math.hypot(x, y, z), 1e-6);
  return { yaw: Math.atan2(x, z), pitch: Math.asin(y / distance), distance };
}
