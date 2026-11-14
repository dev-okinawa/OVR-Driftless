import type { Recording } from '../recording/format';
import type { Recorder } from '../recording/recorder';
import type { SkeletonCalibration } from '../skeleton/calibration';
import type { SkeletonStrain } from '../skeleton/skeletonStrain';
import type { SessionStore } from '../state/sessionStore';

// A recording stores the skeleton calibration as annotations, so that a replay shows the skeleton
// and the strain the user saw while recording (design: skeleton, interaction with recording).

const ANNOTATION_KIND = 'skeleton';

interface SkeletonState {
  readonly calibration: SkeletonCalibration | null;
}

function isRecordOf(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return typeof value === 'object' && value !== null && Object.values(value).every(isItem);
}

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
const isVec3 = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(isNumber);

function parseSkeletonState(data: unknown): SkeletonState | null {
  if (typeof data !== 'object' || data === null) return null;
  const { calibration } = data as { calibration?: unknown };
  if (calibration === null || calibration === undefined) return { calibration: null };
  if (typeof calibration !== 'object') return null;
  const { proportions, jointOffsets } = calibration as { proportions?: unknown; jointOffsets?: unknown };
  if (!isRecordOf(proportions, isNumber) || !isRecordOf(jointOffsets, isVec3)) return null;
  return { calibration: calibration as SkeletonCalibration };
}

/**
 * Writes the skeleton calibration into the recording whenever it changes, and once when a recording starts.
 * Returns the function that stops it.
 */
export function recordSkeletonState(skeleton: SkeletonStrain, recorder: Recorder): () => void {
  let lastWritten: SkeletonCalibration | null | undefined;
  let wasRecording = false;

  const write = (): void => {
    if (!recorder.getSnapshot().isRecording) {
      wasRecording = false;
      return;
    }
    const calibration = skeleton.currentCalibration;
    if (wasRecording && calibration === lastWritten) return;
    wasRecording = true;
    lastWritten = calibration;
    const state: SkeletonState = { calibration };
    recorder.addAnnotation(ANNOTATION_KIND, state);
  };

  const stopSkeleton = skeleton.subscribe(write);
  const stopRecorder = recorder.subscribe(write);
  return () => {
    stopSkeleton();
    stopRecorder();
  };
}

/**
 * During a replay, keeps the skeleton calibration as it was at the replayed moment.
 * Returns the function that stops it.
 */
export function replaySkeletonState(recording: Recording, store: SessionStore, skeleton: SkeletonStrain): () => void {
  const states = recording.annotations
    .filter((annotation) => annotation.kind === ANNOTATION_KIND)
    .map((annotation) => ({ time: annotation.time, state: parseSkeletonState(annotation.data) }))
    .filter((entry): entry is { time: number; state: SkeletonState } => entry.state !== null)
    .sort((a, b) => a.time - b.time);

  let appliedIndex: number | null = null;

  return store.subscribeFrames((frame) => {
    let index = -1;
    for (let i = 0; i < states.length; i++) {
      if ((states[i]?.time ?? Infinity) > frame.time) break;
      index = i;
    }
    if (index === appliedIndex) return;
    appliedIndex = index;

    const calibration = states[index]?.state.calibration ?? null;
    if (calibration) skeleton.restoreCalibration(calibration);
    else skeleton.clearCalibration();
  });
}
