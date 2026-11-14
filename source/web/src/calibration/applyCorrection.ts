import type { DeviceSample, Frame, Pose, SessionInfo } from '../domain/types';
import { poseCompose, poseTransformPoint } from '../math/pose';
import { quatNormalize } from '../math/quat';

/** The ids of the Lighthouse devices of a session; compute once per session, not per frame. */
export function lighthouseDeviceIds(session: SessionInfo): ReadonlySet<string> {
  return new Set(session.devices.filter((device) => device.trackingSystem === 'lighthouse').map((device) => device.id));
}

/**
 * Moves every Lighthouse device that has a pose, tracking or not, by `headsetFromLighthouse`.
 * Headset devices and null poses stay as they are; unchanged samples keep their identity.
 */
export function correctFrame(frame: Frame, lighthouseIds: ReadonlySet<string>, headsetFromLighthouse: Pose): Frame {
  const devices = frame.devices.map((sample): DeviceSample => {
    if (sample.pose === null || !lighthouseIds.has(sample.id)) return sample;
    const composed = poseCompose(headsetFromLighthouse, sample.pose);
    return { ...sample, pose: { position: composed.position, rotation: quatNormalize(composed.rotation) } };
  });
  return { time: frame.time, devices };
}

/** Moves the corners of the Lighthouse play area; the floor height and the devices are unchanged. */
export function correctSession(session: SessionInfo, headsetFromLighthouse: Pose): SessionInfo {
  return {
    ...session,
    playAreas: session.playAreas.map((area) =>
      area.trackingSystem === 'lighthouse'
        ? { ...area, corners: area.corners.map((corner) => poseTransformPoint(headsetFromLighthouse, corner)) }
        : area,
    ),
  };
}
