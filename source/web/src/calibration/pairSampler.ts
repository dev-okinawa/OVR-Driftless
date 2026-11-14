import type { Frame } from '../domain/types';
import type { PairSample } from './pairSample';

export interface PairSampling {
  /** Null when no sample is due or the pair is paused. */
  readonly sample: PairSample | null;
  /** The device of the pair that is not tracking (or has no pose, or is not in the frame); null when both are fine. */
  readonly pausedDeviceId: string | null;
}

const NO_SAMPLE: PairSampling = { sample: null, pausedDeviceId: null };

/** Takes a sample of the pair every `1 / rateHz` seconds of frame time, from raw frames, while both devices track. */
export class PairSampler {
  private nextSampleTime = Number.NEGATIVE_INFINITY;

  constructor(private readonly rateHz: number) {}

  /** Forgets the sampling clock: the next valid frame yields a sample. */
  reset(): void {
    this.nextSampleTime = Number.NEGATIVE_INFINITY;
  }

  take(frame: Frame, controllerId: string, trackerId: string): PairSampling {
    const controller = frame.devices.find((sample) => sample.id === controllerId);
    const tracker = frame.devices.find((sample) => sample.id === trackerId);
    if (!controller || controller.state !== 'tracking' || !controller.pose) {
      return { sample: null, pausedDeviceId: controllerId };
    }
    if (!tracker || tracker.state !== 'tracking' || !tracker.pose) {
      return { sample: null, pausedDeviceId: trackerId };
    }

    const interval = 1 / this.rateHz;
    // A small tolerance, so that float noise in frame times does not cost a whole frame.
    if (frame.time + 1e-9 < this.nextSampleTime) return NO_SAMPLE;
    // Keep the rhythm; after a gap (or the first sample) restart it from this frame.
    const due = this.nextSampleTime + interval;
    this.nextSampleTime = due > frame.time ? due : frame.time + interval;
    return {
      sample: { time: frame.time, headsetFromController: controller.pose, trackerInLighthouse: tracker.pose.position },
      pausedDeviceId: null,
    };
  }
}
