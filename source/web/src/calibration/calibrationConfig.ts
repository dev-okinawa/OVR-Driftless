export interface CalibrationConfig {
  /** Samples of the pair per second of frame time. */
  readonly sampleRateHz: number;
  readonly samplesNeeded: number;
  /** Time between Start and the first sample, to put the headset on and pick up the pair. */
  readonly startDelaySeconds: number;
  /** Smallest rotation spread `ρ` (about radians) that counts as enough turning. */
  readonly minRotationSpread: number;
  /** Smallest horizontal travel of the controller, meters. */
  readonly minTravelMeters: number;
  /** Progress unchanged this long while samples arrive means the motion is not enough. */
  readonly stallSeconds: number;
  /** A fit error above this fails the calibration, millimeters. */
  readonly maxFitErrorMm: number;
}

/** Provisional values; see the Open Items of the specification. */
export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  sampleRateHz: 20,
  samplesNeeded: 250,
  startDelaySeconds: 5,
  minRotationSpread: 0.15,
  minTravelMeters: 0.1,
  stallSeconds: 2,
  maxFitErrorMm: 30,
};
