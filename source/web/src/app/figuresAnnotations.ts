import type { Pose } from '../domain/types';
import type { PairFigures } from '../figures/pairFigures';
import type { Recording } from '../recording/format';
import type { Recorder } from '../recording/recorder';
import type { SessionStore } from '../state/sessionStore';

// A recording stores the declared pair and its reference as annotations, so that a replay shows the
// figures the user saw while recording (design: recording-replay R2, R6).

const ANNOTATION_KIND = 'figures';

interface FiguresState {
  readonly pair: { readonly deviceIdA: string; readonly deviceIdB: string } | null;
  readonly referenceAFromB: Pose | null;
}

const NO_FIGURES: FiguresState = { pair: null, referenceAFromB: null };

function isNumberArray(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === 'number');
}

function parseFiguresState(data: unknown): FiguresState | null {
  if (typeof data !== 'object' || data === null) return null;
  const { pair, referenceAFromB } = data as { pair?: unknown; referenceAFromB?: unknown };
  let parsedPair: FiguresState['pair'] = null;
  if (typeof pair === 'object' && pair !== null) {
    const { deviceIdA, deviceIdB } = pair as { deviceIdA?: unknown; deviceIdB?: unknown };
    if (typeof deviceIdA !== 'string' || typeof deviceIdB !== 'string') return null;
    parsedPair = { deviceIdA, deviceIdB };
  }
  let parsedReference: Pose | null = null;
  if (typeof referenceAFromB === 'object' && referenceAFromB !== null) {
    const { position, rotation } = referenceAFromB as { position?: unknown; rotation?: unknown };
    if (!isNumberArray(position, 3) || !isNumberArray(rotation, 4)) return null;
    parsedReference = referenceAFromB as Pose;
  }
  return { pair: parsedPair, referenceAFromB: parsedReference };
}

/**
 * Writes the pair and its reference into the recording whenever they change, and once when a recording starts.
 * Returns the function that stops it.
 */
export function recordFiguresState(figures: PairFigures, recorder: Recorder): () => void {
  let lastWritten = '';
  let wasRecording = false;

  const write = (): void => {
    const isRecording = recorder.getSnapshot().isRecording;
    if (!isRecording) {
      wasRecording = false;
      return;
    }
    const state: FiguresState = { pair: figures.getSnapshot().pair, referenceAFromB: figures.referencePose };
    const serialized = JSON.stringify(state);
    if (wasRecording && serialized === lastWritten) return;
    wasRecording = true;
    lastWritten = serialized;
    recorder.addAnnotation(ANNOTATION_KIND, state);
  };

  const stopFigures = figures.subscribe(write);
  const stopRecorder = recorder.subscribe(write);
  return () => {
    stopFigures();
    stopRecorder();
  };
}

/**
 * During a replay, keeps the pair and its reference as they were at the replayed moment.
 * Returns the function that stops it.
 */
export function replayFiguresState(recording: Recording, store: SessionStore, figures: PairFigures): () => void {
  const states = recording.annotations
    .filter((annotation) => annotation.kind === ANNOTATION_KIND)
    .map((annotation) => ({ time: annotation.time, state: parseFiguresState(annotation.data) }))
    .filter((entry): entry is { time: number; state: FiguresState } => entry.state !== null)
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

    const state = states[index]?.state ?? NO_FIGURES;
    if (!state.pair) {
      figures.clearPair();
      return;
    }
    figures.setPair(state.pair.deviceIdA, state.pair.deviceIdB);
    if (state.referenceAFromB) figures.restoreReference(state.referenceAFromB);
  });
}
