import type { CorrectionStage } from './correctionStage';
import type { ReferenceTarget, SkeletonFitter } from './measurementTargets';

/**
 * A reference and a skeleton fit are made from corrected poses, so they stop meaning anything when the correction
 * changes. Clears both whenever the stage's correction is replaced or removed. Returns the function that stops it.
 */
export function resetMeasurementsOnCorrectionChange(
  stage: CorrectionStage,
  figures: ReferenceTarget,
  skeleton: SkeletonFitter,
): () => void {
  let last = stage.getSnapshot().headsetFromLighthouse;
  return stage.subscribe(() => {
    const next = stage.getSnapshot().headsetFromLighthouse;
    if (next === last) return;
    last = next;
    figures.clearReference();
    skeleton.clearCalibration();
  });
}
