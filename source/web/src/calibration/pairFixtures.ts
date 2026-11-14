// Synthetic samples of a joined pair for tests: deterministic, with seeded noise.

import type { Pose, Vec3 } from '../domain/types';
import { quatFromAxisAngle, quatFromYaw, quatMultiply, quatRotateVec3 } from '../math/quat';
import type { PairSample } from './pairSample';

export type FixtureMotion = 'full' | 'yaw-only' | 'one-axis' | 'still';

export interface FixtureOptions {
  readonly count: number;
  /** Yaw of `headsetFromLighthouse`, radians. */
  readonly theta: number;
  /** Translation of `headsetFromLighthouse`, meters. */
  readonly translation: Vec3;
  /** The tracker's origin in the controller's frame, meters. */
  readonly link: Vec3;
  readonly motion: FixtureMotion;
  /** Standard deviation of the noise added to every coordinate of the tracker position, millimeters. */
  readonly noiseMm?: number;
  readonly seed?: number;
  /** Seconds between samples. Default 0.05. */
  readonly interval?: number;
}

/** A small deterministic generator (mulberry32), uniform in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function controllerPose(motion: FixtureMotion, t: number): Pose {
  const position: Vec3 = [0.3 * Math.sin(1.3 * t), 1 + 0.1 * Math.sin(0.9 * t + 1), -0.3 + 0.3 * Math.sin(1.7 * t + 1)];
  switch (motion) {
    case 'full':
      return {
        position,
        rotation: quatMultiply(quatFromAxisAngle([1, 0, 0], 0.5 * Math.sin(1.9 * t + 0.5)), quatFromAxisAngle([0, 0, 1], 0.5 * Math.sin(1.2 * t))),
      };
    case 'yaw-only':
      return { position, rotation: quatFromYaw(1.5 * Math.sin(t)) };
    case 'one-axis':
      return { position, rotation: quatFromAxisAngle([1, 0, 0], 0.8 * Math.sin(1.1 * t)) };
    case 'still':
      return { position: [0, 1, -0.3], rotation: quatFromAxisAngle([1, 0, 0], 0.3) };
  }
}

/** Samples consistent with `p_c = Ry(θ)·p_t + t − R_c·q`, the tracker position found from the controller's. */
export function makePairSamples(options: FixtureOptions): PairSample[] {
  const random = seededRandom(options.seed ?? 1);
  const noise = (options.noiseMm ?? 0) / 1000;
  const interval = options.interval ?? 0.05;
  const samples: PairSample[] = [];
  for (let i = 0; i < options.count; i++) {
    const time = i * interval;
    const controller = controllerPose(options.motion, time);
    const link = quatRotateVec3(controller.rotation, options.link);
    const target: Vec3 = [
      controller.position[0] + link[0] - options.translation[0],
      controller.position[1] + link[1] - options.translation[1],
      controller.position[2] + link[2] - options.translation[2],
    ];
    const lighthouseFromHeadset = quatRotateVec3(quatFromYaw(-options.theta), target);
    samples.push({
      time,
      headsetFromController: controller,
      trackerInLighthouse: [
        lighthouseFromHeadset[0] + noise * gaussian(random),
        lighthouseFromHeadset[1] + noise * gaussian(random),
        lighthouseFromHeadset[2] + noise * gaussian(random),
      ],
    });
  }
  return samples;
}
