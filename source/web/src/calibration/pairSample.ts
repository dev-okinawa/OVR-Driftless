import type { Pose, Vec3 } from '../domain/types';

/** One moment of the joined pair, from the raw (uncorrected) poses of one frame. */
export interface PairSample {
  /** Frame time, seconds. */
  readonly time: number;
  /** The controller in the headset's tracking space. */
  readonly headsetFromController: Pose;
  /** The origin of the tracker in the Lighthouse tracking space, meters. */
  readonly trackerInLighthouse: Vec3;
}
