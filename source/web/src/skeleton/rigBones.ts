import type { Pose, Vec3 } from '../domain/types';
import { quatFromAxisAngle, quatRotateVec3 } from '../math/quat';
import { vec3Add, vec3Cross, vec3Distance, vec3Dot, vec3Lerp, vec3Normalize, vec3Scale, vec3Sub } from '../math/vec3';
import type { BodyDevices } from './calibration';
import { CHIN_ABOVE_NECK, HEAD_TOP_ABOVE_NECK, HEAD_WIDTH, type BoneName } from './proportions';
import type { SkeletonPose } from './solve';

/**
 * The skeleton as drawn: a Unity humanoid rig (bones named after `HumanBodyBones`, with fingers and toes) laid
 * over the solved joints, the way the designer's rig is drawn. Lengths and rest poses of the parts the model does
 * not solve (spine segments, hands, fingers, feet) are the designer's, as fractions of body height.
 */
export interface RigBone {
  readonly name: string;
  /** The model bone whose strain marks this one; null for a finger, which strain never marks. */
  readonly strainBone: BoneName | null;
  readonly head: Vec3;
  readonly tail: Vec3;
  /** The direction the diamond's front faces. */
  readonly up: Vec3;
  /** Full width of the widest ring, meters, and its place along the bone; absent for a slender bone. */
  readonly width?: number;
  readonly widest?: number;
  /** No other bone starts at its tail, so the tail carries a joint ring too. */
  readonly leaf: boolean;
}

/** Five body bones per side for each arm and leg, six on the spine, 15 per hand. */
export const RIG_BONE_COUNT = 22 + 30;

const UP: Vec3 = [0, 1, 0];
/** Joints of Hips, Spine, Chest, UpperChest and the neck along the spine, from the segment lengths 0.05, 0.08, 0.08, 0.07. */
const SPINE_JOINTS = [0, 0.05 / 0.28, 0.13 / 0.28, 0.21 / 0.28, 1];
/** The shoulder bone starts this far from UpperChest's joint toward the neck. */
const SHOULDER_BASE = 0.6;
/** A head is widest at the cheeks, not at the chin. */
const HEAD_WIDEST = 0.4;
const RATIO = {
  hand: 0.052,
  gripBack: 0.04,
  palmHalfWidth: 0.022,
  foot: 0.085,
  toes: 0.035,
  ankle: 0.039,
} as const;
/** A held controller leans up from the hand, degrees. */
const GRIP_PITCH_DEG = 25;
/** The wrist cannot flex further than this from the forearm line, degrees. */
const MAX_WRIST_FLEX_DEG = 65;

type Finger = 'Thumb' | 'Index' | 'Middle' | 'Ring' | 'Little';
const FINGER_JOINTS = ['Proximal', 'Intermediate', 'Distal'] as const;
/** Lengths of [proximal, intermediate, distal] as fractions of body height. */
const FINGER_LENGTHS: Readonly<Record<Finger, readonly number[]>> = {
  Thumb: [0.0225, 0.018, 0.0153],
  Index: [0.0235, 0.0145, 0.0125],
  Middle: [0.0258, 0.0162, 0.014],
  Ring: [0.0242, 0.0152, 0.0132],
  Little: [0.0195, 0.0115, 0.0105],
};
/** The body the designer's finger offsets (`back`, meters) were set on. */
const DESIGN_HEIGHT = 1.77;
/** Relaxed fingers: place across the palm (palm half-widths, thumb side +), offset along the hand, spread and bend of each joint, degrees. */
const FINGER_REST: Readonly<Record<Exclude<Finger, 'Thumb'>, { lateral: number; back: number; spread: number; curl: readonly number[] }>> = {
  Index: { lateral: 0.68, back: 0, spread: 3, curl: [16, 26, 12] },
  Middle: { lateral: 0.23, back: 0.002, spread: 0, curl: [21, 31, 14] },
  Ring: { lateral: -0.23, back: 0, spread: -3, curl: [26, 34, 16] },
  Little: { lateral: -0.68, back: -0.008, spread: -8, curl: [31, 38, 18] },
};
/** Directions of the thumb's bones in the hand's axes [f, t, b]: off the side of the palm, turned toward it. */
const THUMB_REST: readonly Vec3[] = [
  [0.62, 0.62, -0.35],
  [0.8, 0.38, -0.45],
  [0.88, 0.12, -0.5],
];

/** A hand's axes: `f` from the wrist to the knuckles, `t` to the thumb side, `b` out of the back of the hand. */
interface HandFrame {
  readonly f: Vec3;
  readonly t: Vec3;
  readonly b: Vec3;
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const rotateAbout = (v: Vec3, axis: Vec3, angle: number): Vec3 => quatRotateVec3(quatFromAxisAngle(axis, angle), v);
/** The part of `hint` across `axis`, normalized; `fallback`'s when `hint` runs along the axis. */
function across(axis: Vec3, hint: Vec3, fallback: Vec3): Vec3 {
  const cut = (v: Vec3): Vec3 => vec3Sub(v, vec3Scale(axis, vec3Dot(v, axis)));
  const first = cut(hint);
  if (Math.hypot(...first) > 0.2) return vec3Normalize(first);
  return vec3Normalize(cut(fallback), [1, 0, 0]);
}

/** The point at share `t` of the length of a polyline. */
function alongPolyline(points: readonly Vec3[], t: number): Vec3 {
  const lengths = points.slice(1).map((point, i) => vec3Distance(points[i] ?? point, point));
  let rest = t * lengths.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i] ?? 0;
    const from = points[i];
    const to = points[i + 1];
    if (from && to && (rest <= length || i === lengths.length - 1)) return vec3Lerp(from, to, length > 0 ? Math.min(1, rest / length) : 0);
    rest -= length;
  }
  return points[0] ?? [0, 0, 0];
}

/**
 * The Hand bone's axes. With a tracked controller: its orientation (-Z forward, +Y up, +X right) turned by the grip,
 * the wrist's flex limited; without one the hand continues the forearm, the back of the hand outward, or up when the
 * arm itself points outward. `sign` is -1 for the left hand.
 */
function handFrame(controller: Pose | undefined, forearm: Vec3, sign: number, side: Vec3): HandFrame {
  if (!controller) {
    const b = across(forearm, side, UP);
    return { f: forearm, t: vec3Scale(vec3Normalize(vec3Cross(b, forearm)), sign), b };
  }
  const r = quatRotateVec3(controller.rotation, [1, 0, 0]);
  const grip = -radians(GRIP_PITCH_DEG);
  let f = rotateAbout(quatRotateVec3(controller.rotation, [0, 0, -1]), r, grip);
  let t = rotateAbout(quatRotateVec3(controller.rotation, [0, 1, 0]), r, grip);
  let b = vec3Scale(r, sign);
  const flex = Math.acos(Math.min(1, Math.max(-1, vec3Dot(f, forearm))));
  const limit = radians(MAX_WRIST_FLEX_DEG);
  if (flex > limit) {
    const axis = vec3Normalize(vec3Cross(f, forearm), UP);
    const turn = flex - limit;
    f = rotateAbout(f, axis, turn);
    t = rotateAbout(t, axis, turn);
    b = rotateAbout(b, axis, turn);
  }
  return { f, t, b };
}

export function rigBones(pose: SkeletonPose, devices: BodyDevices, heightMeters: number): RigBone[] {
  const H = heightMeters;
  const j = pose.joints;
  const right = vec3Normalize(vec3Sub(j.rightShoulder, j.leftShoulder), [1, 0, 0]);
  const forward = vec3Cross(UP, right);
  const bones: Omit<RigBone, 'leaf'>[] = [];
  const put = (name: string, strainBone: BoneName | null, head: Vec3, tail: Vec3, up: Vec3, shape?: { width: number; widest: number }): void => {
    bones.push({ name, strainBone, head, tail, up, ...shape });
  };

  const spine = SPINE_JOINTS.map((t) => alongPolyline([j.hips, j.chest, j.neck], t));
  const [hips = j.hips, spine1 = j.hips, chest = j.chest, upperChest = j.neck] = spine;
  put('Hips', 'hips-chest', hips, spine1, forward);
  put('Spine', 'hips-chest', spine1, chest, forward);
  put('Chest', 'chest-neck', chest, upperChest, forward);
  put('UpperChest', 'chest-neck', upperChest, j.neck, forward);
  const headAxis = vec3Normalize(vec3Sub(j.head, j.neck), UP);
  const chin = vec3Add(j.neck, vec3Scale(headAxis, CHIN_ABOVE_NECK * H));
  put('Neck', 'neck-head', j.neck, chin, forward);
  put('Head', 'neck-head', chin, vec3Add(j.neck, vec3Scale(headAxis, HEAD_TOP_ABOVE_NECK * H)), forward, {
    width: HEAD_WIDTH * H,
    widest: HEAD_WIDEST,
  });

  const shoulderBase = vec3Lerp(upperChest, j.neck, SHOULDER_BASE);
  const arms = [
    {
      prefix: 'Left',
      sign: -1,
      shoulder: j.leftShoulder,
      elbow: j.leftElbow,
      hand: j.leftHand,
      controller: devices['left-hand'],
      bones: ['neck-leftShoulder', 'leftShoulder-leftElbow', 'leftElbow-leftHand'],
    },
    {
      prefix: 'Right',
      sign: 1,
      shoulder: j.rightShoulder,
      elbow: j.rightElbow,
      hand: j.rightHand,
      controller: devices['right-hand'],
      bones: ['neck-rightShoulder', 'rightShoulder-rightElbow', 'rightElbow-rightHand'],
    },
  ] as const;
  for (const arm of arms) {
    const side = vec3Scale(right, arm.sign);
    const [shoulderBone, upperBone, lowerBone] = arm.bones;
    // The model's hand joint is the controller grip; the wrist sits behind it.
    const wrist = arm.controller
      ? vec3Sub(arm.hand, vec3Scale(quatRotateVec3(arm.controller.rotation, [0, 0, -1]), RATIO.gripBack * H))
      : vec3Sub(arm.hand, vec3Scale(vec3Normalize(vec3Sub(arm.hand, arm.elbow), side), RATIO.gripBack * H));
    const forearm = vec3Normalize(vec3Sub(wrist, arm.elbow), side);
    const hand = handFrame(arm.controller, forearm, arm.sign, side);
    put(`${arm.prefix}Shoulder`, shoulderBone, shoulderBase, arm.shoulder, UP);
    put(`${arm.prefix}UpperArm`, upperBone, arm.shoulder, arm.elbow, forward);
    put(`${arm.prefix}LowerArm`, lowerBone, arm.elbow, wrist, forward);
    put(`${arm.prefix}Hand`, lowerBone, wrist, vec3Add(wrist, vec3Scale(hand.f, RATIO.hand * H)), hand.b);

    const chain = (finger: Finger, root: Vec3, directions: readonly Vec3[]): void => {
      let from = root;
      directions.forEach((direction, index) => {
        const to = vec3Add(from, vec3Scale(direction, (FINGER_LENGTHS[finger][index] ?? 0) * H));
        put(`${arm.prefix}${finger}${FINGER_JOINTS[index] ?? ''}`, null, from, to, hand.b);
        from = to;
      });
    };
    const knuckles = vec3Add(wrist, vec3Scale(hand.f, RATIO.hand * H));
    const palm = RATIO.palmHalfWidth * H;
    const local = (v: Vec3): Vec3 => vec3Add(vec3Add(vec3Scale(hand.f, v[0]), vec3Scale(hand.t, v[1])), vec3Scale(hand.b, v[2]));
    const thumbBase = vec3Add(wrist, local([RATIO.hand * H * 0.3, palm * 0.95, -palm * 0.3]));
    chain('Thumb', thumbBase, THUMB_REST.map((d) => vec3Normalize(local(d))));
    for (const finger of ['Index', 'Middle', 'Ring', 'Little'] as const) {
      const rest = FINGER_REST[finger];
      const root = vec3Add(knuckles, local([rest.back * (H / DESIGN_HEIGHT), rest.lateral * palm, 0]));
      let bend = 0;
      const spread = radians(rest.spread);
      const directions = rest.curl.map((angle) => {
        bend += radians(angle);
        return vec3Normalize(local([Math.cos(bend), Math.sin(spread), -Math.sin(bend)]));
      });
      chain(finger, root, directions);
    }
  }

  // The foot stands flat along the body's forward: how a tracker is turned on its foot is not calibrated.
  const restPitch = Math.asin(Math.min(1, RATIO.ankle / RATIO.foot));
  const footDir = vec3Add(vec3Scale(forward, Math.cos(restPitch)), vec3Scale(UP, -Math.sin(restPitch)));
  const legs = [
    { prefix: 'Left', hip: j.leftHip, knee: j.leftKnee, ankle: j.leftFoot, bones: ['leftHip-leftKnee', 'leftKnee-leftFoot'] },
    { prefix: 'Right', hip: j.rightHip, knee: j.rightKnee, ankle: j.rightFoot, bones: ['rightHip-rightKnee', 'rightKnee-rightFoot'] },
  ] as const;
  for (const leg of legs) {
    const [upperBone, lowerBone] = leg.bones;
    const ball = vec3Add(leg.ankle, vec3Scale(footDir, RATIO.foot * H));
    put(`${leg.prefix}UpperLeg`, upperBone, leg.hip, leg.knee, forward);
    put(`${leg.prefix}LowerLeg`, lowerBone, leg.knee, leg.ankle, forward);
    put(`${leg.prefix}Foot`, lowerBone, leg.ankle, ball, UP);
    put(`${leg.prefix}Toes`, lowerBone, ball, vec3Add(ball, vec3Scale(forward, RATIO.toes * H)), UP);
  }

  const key = (point: Vec3): string => point.map((value) => value.toFixed(5)).join(',');
  const heads = new Set(bones.map((bone) => key(bone.head)));
  return bones.map((bone) => ({ ...bone, leaf: !heads.has(key(bone.tail)) }));
}
