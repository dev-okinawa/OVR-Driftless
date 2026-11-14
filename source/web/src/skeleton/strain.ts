import type { BodyPart, Vec3 } from '../domain/types';
import { vec3Distance } from '../math/vec3';
import type { BodyDevices, SkeletonCalibration } from './calibration';
import type { BoneName } from './proportions';
import type { SkeletonPose } from './solve';

/**
 * PROVISIONAL values. The design leaves open which amount of strain counts as drift rather than
 * ordinary body motion (open item Q4) until it can be compared with measured drift on recordings.
 * They are chosen so that an aligned person standing, walking, squatting and reaching stays near zero.
 */
export const STRAIN_TUNING = {
  /** Head to hips may exceed neck + spine by this much before it counts. */
  spineToleranceM: 0.06,
  /** Hip joint to foot may exceed thigh + shin by this much. */
  legToleranceM: 0.05,
  /** A foot (ankle joint) may be this far below its standing height above the floor. */
  floorToleranceM: 0.03,
  /** The filtered horizontal head-to-hips distance may be this large. Leaning and squatting shift the hips this much. */
  hipsOffsetToleranceM: 0.12,
  /** Time constant of the low-pass filter on the horizontal head-to-hips distance. Bending is brief, drift is permanent. */
  hipsOffsetTimeConstantS: 5,
} as const;

export type StrainPartName = 'spine' | 'leftLeg' | 'rightLeg' | 'leftFootFloor' | 'rightFootFloor' | 'hipsOffset';

export interface StrainPart {
  readonly name: StrainPartName;
  readonly mm: number;
  readonly bones: readonly BoneName[];
}

export interface StrainResult {
  /** The largest part. */
  readonly totalMm: number;
  /** Every part that could be measured, zero ones included. */
  readonly parts: readonly StrainPart[];
}

/** What the filter on the head-to-hips distance carries between calls. */
export interface StrainState {
  /** Low-pass filtered horizontal distance between head and hips, meters. */
  filteredHipsOffsetM: number;
  /** Time of the previous call, seconds; null before the first. */
  lastTime: number | null;
}

export function createStrainState(): StrainState {
  return { filteredHipsOffsetM: 0, lastTime: null };
}

/** Body parts a Lighthouse tracker is worn on; the headset and the controllers belong to the other system. */
const LIGHTHOUSE_PARTS: readonly BodyPart[] = ['waist', 'chest', 'left-foot', 'right-foot'];

const SPINE_BONES: readonly BoneName[] = ['hips-chest', 'chest-neck', 'neck-head'];

const toMm = (meters: number): number => Math.max(0, meters) * 1000;

/**
 * How far the body would have to stretch to follow every device, in millimeters per part.
 * Null when no Lighthouse-tracked body part is tracking: nothing connects the two tracking systems.
 * Updates `state` (the filter) in place; `time` is the frame time in seconds.
 */
export function computeStrain(
  devices: BodyDevices,
  calibration: SkeletonCalibration,
  pose: SkeletonPose,
  floorHeight: number,
  state: StrainState,
  time: number,
): StrainResult | null {
  if (!LIGHTHOUSE_PARTS.some((part) => devices[part] && calibration.jointOffsets[part])) return null;

  const p = calibration.proportions;
  const t = STRAIN_TUNING;
  const j = pose.joints;
  const parts: StrainPart[] = [];

  if (pose.drivenJoints.has('hips')) {
    parts.push({ name: 'spine', mm: toMm(vec3Distance(j.head, j.hips) - (p.neck + p.spine) - t.spineToleranceM), bones: SPINE_BONES });

    const offset = Math.hypot(j.head[0] - j.hips[0], j.head[2] - j.hips[2]);
    const dt = state.lastTime === null ? 0 : time - state.lastTime;
    if (dt < 0) {
      // Time went backwards (a replay seeked back): what was filtered belongs to another moment.
      state.filteredHipsOffsetM = 0;
    } else if (dt > 0) {
      state.filteredHipsOffsetM += (offset - state.filteredHipsOffsetM) * (1 - Math.exp(-dt / t.hipsOffsetTimeConstantS));
    }
    parts.push({ name: 'hipsOffset', mm: toMm(state.filteredHipsOffsetM - t.hipsOffsetToleranceM), bones: SPINE_BONES });
  } else {
    state.filteredHipsOffsetM = 0;
  }
  state.lastTime = time;

  const legReach = p.thigh + p.shin;
  const footMinY = floorHeight + p.ankleHeight;
  const feet: readonly {
    leg: StrainPartName;
    floor: StrainPartName;
    hip: Vec3;
    foot: Vec3;
    driven: boolean;
    bones: readonly BoneName[];
    footBone: BoneName;
  }[] = [
    {
      leg: 'leftLeg',
      floor: 'leftFootFloor',
      hip: j.leftHip,
      foot: j.leftFoot,
      driven: pose.drivenJoints.has('leftFoot'),
      bones: ['leftHip-leftKnee', 'leftKnee-leftFoot'],
      footBone: 'leftKnee-leftFoot',
    },
    {
      leg: 'rightLeg',
      floor: 'rightFootFloor',
      hip: j.rightHip,
      foot: j.rightFoot,
      driven: pose.drivenJoints.has('rightFoot'),
      bones: ['rightHip-rightKnee', 'rightKnee-rightFoot'],
      footBone: 'rightKnee-rightFoot',
    },
  ];
  for (const f of feet) {
    if (!f.driven) continue;
    parts.push({ name: f.leg, mm: toMm(vec3Distance(f.hip, f.foot) - legReach - t.legToleranceM), bones: f.bones });
    parts.push({ name: f.floor, mm: toMm(footMinY - f.foot[1] - t.floorToleranceM), bones: [f.footBone] });
  }

  return { totalMm: parts.reduce((max, part) => Math.max(max, part.mm), 0), parts };
}
