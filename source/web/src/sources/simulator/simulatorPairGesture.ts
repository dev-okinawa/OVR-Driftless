import type { PairGesture } from '../../calibration/pairGesture';
import { DEVICE_IDS } from './model';
import type { MotionPreset } from './model';
import type { SimulatorControls } from './simulatorSource';

/** The simulated person joins the right controller and the waist tracker and waves them. */
export function createSimulatorPairGesture(controls: SimulatorControls): PairGesture {
  let motionBeforeWaving: MotionPreset | null = null;

  const canJoin = (controllerId: string, trackerId: string): boolean =>
    controllerId === DEVICE_IDS.controllerRight && trackerId === DEVICE_IDS.trackerWaist;

  return {
    canJoin,

    startWaving(controllerId, trackerId) {
      // A second call must not remember the wave itself as the motion to return to.
      motionBeforeWaving ??= controls.getState().motion;
      controls.setPairAttached(canJoin(controllerId, trackerId));
      controls.setMotion('wave');
    },

    stopWaving() {
      if (motionBeforeWaving === null) return;
      controls.setMotion(motionBeforeWaving);
      motionBeforeWaving = null;
    },

    release() {
      controls.setPairAttached(false);
    },
  };
}
