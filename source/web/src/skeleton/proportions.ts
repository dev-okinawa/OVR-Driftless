export const JOINT_NAMES = [
  'head',
  'neck',
  'chest',
  'hips',
  'leftShoulder',
  'leftElbow',
  'leftHand',
  'rightShoulder',
  'rightElbow',
  'rightHand',
  'leftHip',
  'leftKnee',
  'leftFoot',
  'rightHip',
  'rightKnee',
  'rightFoot',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

/** A bone joins two joints, from the parent joint to the child; its name is `from-to`. */
export const BONES = [
  { name: 'hips-chest', from: 'hips', to: 'chest' },
  { name: 'chest-neck', from: 'chest', to: 'neck' },
  { name: 'neck-head', from: 'neck', to: 'head' },
  { name: 'neck-leftShoulder', from: 'neck', to: 'leftShoulder' },
  { name: 'leftShoulder-leftElbow', from: 'leftShoulder', to: 'leftElbow' },
  { name: 'leftElbow-leftHand', from: 'leftElbow', to: 'leftHand' },
  { name: 'neck-rightShoulder', from: 'neck', to: 'rightShoulder' },
  { name: 'rightShoulder-rightElbow', from: 'rightShoulder', to: 'rightElbow' },
  { name: 'rightElbow-rightHand', from: 'rightElbow', to: 'rightHand' },
  { name: 'hips-leftHip', from: 'hips', to: 'leftHip' },
  { name: 'leftHip-leftKnee', from: 'leftHip', to: 'leftKnee' },
  { name: 'leftKnee-leftFoot', from: 'leftKnee', to: 'leftFoot' },
  { name: 'hips-rightHip', from: 'hips', to: 'rightHip' },
  { name: 'rightHip-rightKnee', from: 'rightHip', to: 'rightKnee' },
  { name: 'rightKnee-rightFoot', from: 'rightKnee', to: 'rightFoot' },
] as const satisfies readonly { name: string; from: JointName; to: JointName }[];

export type BoneName = (typeof BONES)[number]['name'];

/** Bone lengths and heights above the floor of a standing body, meters. */
export interface SkeletonProportions {
  readonly heightMeters: number;
  /** Headset (eye) height above the floor. */
  readonly eyeHeight: number;
  /** Head joint to neck joint. */
  readonly neck: number;
  /** Hips to neck joint. */
  readonly spine: number;
  /** Between the two shoulder joints. */
  readonly shoulderWidth: number;
  readonly upperArm: number;
  /** Elbow to the hand joint (the controller grip). */
  readonly forearm: number;
  /** Between the two hip joints. */
  readonly hipWidth: number;
  readonly thigh: number;
  readonly shin: number;
  /** Height of the ankle joint above the floor. */
  readonly ankleHeight: number;
  /** Height of the hips above the floor: thigh + shin + ankle height. */
  readonly hipHeight: number;
}

/**
 * Ratios to body height from the Drillis and Contini segment table, as reproduced in
 * D. A. Winter, "Biomechanics and Motor Control of Human Movement": eye 0.936, shoulder 0.818,
 * thigh 0.245, shin 0.246, ankle 0.039, upper arm 0.186, forearm with the hand grip 0.146 + 0.04,
 * shoulder width 0.259, hip joint distance 0.191 (rounded).
 */
const EYE = 0.936;
/** Eye height as a fraction of body height, to turn the headset's height above the floor into a body height. */
export const EYE_HEIGHT_RATIO = EYE;
const SHOULDER = 0.818;
const THIGH = 0.245;
const SHIN = 0.246;
const ANKLE = 0.039;
const UPPER_ARM = 0.186;
const FOREARM = 0.186;
const SHOULDER_WIDTH = 0.259;
const HIP_WIDTH = 0.191;

/** Chin height in the same table; the drawn head starts here. */
const CHIN = 0.87;
/** Along the line from the neck joint to the head joint, as fractions of body height: the chin and the top of the head. */
export const CHIN_ABOVE_NECK = CHIN - SHOULDER;
export const HEAD_TOP_ABOVE_NECK = 1 - SHOULDER;
/** Width of the head as a fraction of body height. */
export const HEAD_WIDTH = 0.085;

/** Where the chest joint lies on the spine, as a fraction of the way from the hips to the neck. */
export const CHEST_ALONG_SPINE = 0.6;

/** Average adult height, meters: used for the T-pose shown before calibration gives the user's own height. */
const DEFAULT_HEIGHT_METERS = 1.7;

export function createProportions(heightMeters: number): SkeletonProportions {
  const h = heightMeters;
  const hipHeight = (THIGH + SHIN + ANKLE) * h;
  return {
    heightMeters: h,
    eyeHeight: EYE * h,
    neck: (EYE - SHOULDER) * h,
    spine: SHOULDER * h - hipHeight,
    shoulderWidth: SHOULDER_WIDTH * h,
    upperArm: UPPER_ARM * h,
    forearm: FOREARM * h,
    hipWidth: HIP_WIDTH * h,
    thigh: THIGH * h,
    shin: SHIN * h,
    ankleHeight: ANKLE * h,
    hipHeight,
  };
}

export const DEFAULT_PROPORTIONS: SkeletonProportions = createProportions(DEFAULT_HEIGHT_METERS);
