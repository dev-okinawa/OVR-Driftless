import { CalibrationController } from '../calibration/calibrationController';
import { CorrectionStage } from '../calibration/correctionStage';
import { resetMeasurementsOnCorrectionChange } from '../calibration/resetMeasurementsOnCorrectionChange';
import { PairFigures } from '../figures/pairFigures';
import { Recorder } from '../recording/recorder';
import type { SceneLayer } from '../scene/layer';
import { createSkeletonLayer } from '../skeleton/skeletonLayer';
import { SkeletonStrain } from '../skeleton/skeletonStrain';
import type { PoseSource } from '../sources/source';
import { SessionStore } from '../state/sessionStore';

// One instance of each for the life of the page. They hold no React state and outlive any component.

/** Where the active source feeds into. */
export const store = new SessionStore();

export const recorder = new Recorder(store);

/** Desynchronization figures of the declared device pair. */
export const figures = new PairFigures(store);

/** The body skeleton and its strain. */
export const skeleton = new SkeletonStrain(store);

/** The skeleton drawn in the 3D scene. */
export const skeletonLayer: SceneLayer = createSkeletonLayer(skeleton);

/** Moves the Lighthouse poses of every attached source by the calibration result. */
export const stage = new CorrectionStage();

/** The initial calibration of the Lighthouse space against the headset's. */
export const calibration = new CalibrationController({ store, stage, figures, skeleton });

// A reference and a skeleton fit belong to one correction: drop them whenever it changes.
resetMeasurementsOnCorrectionChange(stage, figures, skeleton);

/** Attaches a source to the store through the correction stage; use it instead of `store.attach`. */
export function attachSource(source: PoseSource): void {
  store.attach(stage.wrap(source));
}
