import { formatClock } from '@ai-designer/ui';
import { useSyncExternalStore } from 'react';
import type { Recorder } from './recorder';
import type { RecordingFlow } from './useRecordingFlow';

export interface RecordingPanelProps {
  readonly recorder: Recorder;
  readonly flow: RecordingFlow;
  /** Why a recording cannot start now; null when it can. */
  readonly recordBlockedReason: string | null;
}

function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * The Record and Open recording buttons of the top row. One button element serves Record, the "REC m:ss" Stop pill
 * and "Unsaved recording", so focus stays on it when it changes into the next one.
 */
export function RecordingPanel({ recorder, flow, recordBlockedReason }: RecordingPanelProps) {
  const snapshot = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot);
  const recording = snapshot.isRecording;
  const unsaved = !recording && flow.unsaved !== null;
  const blocked = recording || unsaved ? null : (recordBlockedReason ?? (flow.saving ? 'Saving the recording' : null));

  let tip = blocked ?? 'Record the session';
  let label = 'Record';
  let onClick = () => recorder.start();
  if (recording) {
    tip = `Stop and save the recording · ${formatCount(snapshot.frameCount)} frames`;
    label = `Stop recording, ${formatClock(snapshot.durationSeconds)} recorded`;
    onClick = flow.stop;
  } else if (unsaved) {
    tip = 'The last recording is not saved. Save or discard it.';
    label = 'Unsaved recording';
    onClick = flow.reopenSaveError;
  }

  return (
    <>
      <ui-tooltip content={tip} placement="bottom">
        <ui-button
          data-open="record"
          variant="floating"
          size="lg"
          tone={recording || unsaved ? 'critical' : 'neutral'}
          icon={recording ? 'stop' : unsaved ? 'save' : 'record'}
          iconOnly={!recording && !unsaved}
          label={label}
          disabled={blocked !== null}
          onClick={onClick}
        >
          {recording ? `REC ${formatClock(snapshot.durationSeconds)}` : unsaved ? 'Unsaved recording' : null}
        </ui-button>
      </ui-tooltip>
      <ui-tooltip content={recording ? 'Stop the recording to open a file' : 'Open a recording'} placement="bottom">
        <ui-button
          data-open="open-recording"
          variant="floating"
          size="lg"
          icon="folder-open"
          iconOnly
          label="Open recording"
          disabled={recording}
          onClick={flow.openFile}
        />
      </ui-tooltip>
    </>
  );
}
