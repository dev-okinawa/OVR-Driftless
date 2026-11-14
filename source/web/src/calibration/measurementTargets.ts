/** What the calibration needs of the drift figures: a pair with a reference, and a way to drop the reference. */
export interface ReferenceTarget {
  setPair(deviceIdA: string, deviceIdB: string): void;
  setReference(): boolean;
  clearReference(): void;
}

/** What the calibration needs of the skeleton: fitting to the body now, and dropping the fit. */
export interface SkeletonFitter {
  calibrate(): boolean;
  clearCalibration(): void;
}
