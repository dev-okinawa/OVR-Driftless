import type { Vec3 } from '../domain/types';
import { poseTransformPoint } from '../math/pose';
import { vec3Add, vec3Lerp, vec3Normalize, vec3Scale } from '../math/vec3';
import { type BodyDevices, type SkeletonCalibration } from './calibration';
import { horizontalForward } from './facing';
import { CHEST_ALONG_SPINE, type JointName } from './proportions';
import { solveTwoBoneChain } from './twoBoneIk';

export interface SkeletonPose {
  readonly joints: Readonly<Record<JointName, Vec3>>;
  /** Joints placed directly from a device (through its calibrated offset); the rest were placed by inverse kinematics. */
  readonly drivenJoints: ReadonlySet<JointName>;
}

/** How far out (sideways) an elbow bends, relative to how far back. */
const ELBOW_OUT = 0.3;
/** A hand without a controller hangs this fraction of the full arm length below the shoulder. */
const HANGING_ARM = 0.9;

/** Null when the head is not tracking. */
export function solveSkeleton(devices: BodyDevices, calibration: SkeletonCalibration, floorHeight: number): SkeletonPose | null {
  const headPose = devices.head;
  if (!headPose) return null;
  const p = calibration.proportions;
  const driven = new Set<JointName>(['head']);

  /** The joint's world position through the tracker's calibrated offset, or null when that tracker does not drive it. */
  const fromTracker = (part: 'waist' | 'chest' | 'left-foot' | 'right-foot', joint: JointName): Vec3 | null => {
    const tracker = devices[part];
    const offset = calibration.jointOffsets[part];
    if (!tracker || !offset) return null;
    driven.add(joint);
    return poseTransformPoint(tracker, offset);
  };
  const fromController = (part: 'left-hand' | 'right-hand', joint: JointName): Vec3 | null => {
    const controller = devices[part];
    if (!controller) return null;
    driven.add(joint);
    return controller.position;
  };

  const head = headPose.position;
  const hipsDriven = fromTracker('waist', 'hips');
  const chestDriven = fromTracker('chest', 'chest');
  const leftFootDriven = fromTracker('left-foot', 'leftFoot');
  const rightFootDriven = fromTracker('right-foot', 'rightFoot');

  // Body facing: the head's horizontal forward blended with the waist tracker's when it is tracking.
  let forward = horizontalForward(headPose.rotation);
  if (hipsDriven && devices.waist) {
    forward = vec3Normalize(vec3Add(forward, horizontalForward(devices.waist.rotation)), forward);
  }
  const right: Vec3 = [-forward[2], 0, forward[0]];
  const left: Vec3 = vec3Scale(right, -1);

  // Hips.
  let hips = hipsDriven;
  if (!hips) {
    const halfHip = vec3Scale(right, p.hipWidth / 2);
    const centers: Vec3[] = [];
    if (leftFootDriven) centers.push(vec3Add(leftFootDriven, halfHip));
    if (rightFootDriven) centers.push(vec3Add(rightFootDriven, vec3Scale(halfHip, -1)));
    let hipsX = head[0];
    let hipsZ = head[2];
    if (centers.length > 0) {
      const mx = centers.reduce((sum, c) => sum + c[0], 0) / centers.length;
      const mz = centers.reduce((sum, c) => sum + c[2], 0) / centers.length;
      // The hips lean from over the feet toward the head in proportion to their height.
      const t = p.hipHeight / p.eyeHeight;
      hipsX = mx + (head[0] - mx) * t;
      hipsZ = mz + (head[2] - mz) * t;
    }
    const spineLength = p.neck + p.spine;
    const sideways = Math.hypot(head[0] - hipsX, head[2] - hipsZ);
    hips = [hipsX, head[1] - Math.sqrt(Math.max(0, spineLength * spineLength - sideways * sideways)), hipsZ];
  }

  // Neck and chest on the line from the hips to the head.
  const neckAlong = p.spine / (p.spine + p.neck);
  const neck = vec3Lerp(hips, head, neckAlong);
  const chest = chestDriven ?? vec3Lerp(hips, head, neckAlong * CHEST_ALONG_SPINE);

  const shoulderOffset = vec3Scale(right, p.shoulderWidth / 2);
  const leftShoulder = vec3Add(neck, vec3Scale(shoulderOffset, -1));
  const rightShoulder = vec3Add(neck, shoulderOffset);
  const hipOffset = vec3Scale(right, p.hipWidth / 2);
  const leftHip = vec3Add(hips, vec3Scale(hipOffset, -1));
  const rightHip = vec3Add(hips, hipOffset);

  const floorFoot = (hip: Vec3): Vec3 => [hip[0], floorHeight + p.ankleHeight, hip[2]];
  const leftFootTarget = leftFootDriven ?? floorFoot(leftHip);
  const rightFootTarget = rightFootDriven ?? floorFoot(rightHip);
  const leftLeg = solveTwoBoneChain(leftHip, leftFootTarget, p.thigh, p.shin, forward);
  const rightLeg = solveTwoBoneChain(rightHip, rightFootTarget, p.thigh, p.shin, forward);

  const hang = (shoulder: Vec3): Vec3 => [shoulder[0], shoulder[1] - (p.upperArm + p.forearm) * HANGING_ARM, shoulder[2]];
  const leftHandDriven = fromController('left-hand', 'leftHand');
  const rightHandDriven = fromController('right-hand', 'rightHand');
  const leftArm = solveTwoBoneChain(leftShoulder, leftHandDriven ?? hang(leftShoulder), p.upperArm, p.forearm, elbowPole(forward, left));
  const rightArm = solveTwoBoneChain(rightShoulder, rightHandDriven ?? hang(rightShoulder), p.upperArm, p.forearm, elbowPole(forward, right));

  return {
    joints: {
      head,
      neck,
      chest,
      hips,
      leftShoulder,
      leftElbow: leftArm.mid,
      leftHand: leftHandDriven ?? leftArm.end,
      rightShoulder,
      rightElbow: rightArm.mid,
      rightHand: rightHandDriven ?? rightArm.end,
      leftHip,
      leftKnee: leftLeg.mid,
      leftFoot: leftFootDriven ?? leftLeg.end,
      rightHip,
      rightKnee: rightLeg.mid,
      rightFoot: rightFootDriven ?? rightLeg.end,
    },
    drivenJoints: driven,
  };
}

/** Elbows bend back and slightly out. */
function elbowPole(forward: Vec3, outward: Vec3): Vec3 {
  return vec3Add(vec3Scale(forward, -1), vec3Scale(outward, ELBOW_OUT));
}
