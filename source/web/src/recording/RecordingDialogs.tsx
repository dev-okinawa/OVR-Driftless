import { formatClock } from '@ai-designer/ui';
import { recordingDuration } from './recordingSummary';
import type { RecordingFlow } from './useRecordingFlow';

export interface RecordingDialogsProps {
  readonly flow: RecordingFlow;
}

/** The file that cannot be opened, the recording that could not be saved, and the confirmation of discarding it. */
export function RecordingDialogs({ flow }: RecordingDialogsProps) {
  const { unsaved } = flow;
  const duration = unsaved ? recordingDuration(unsaved.recording) : 0;
  const frames = unsaved?.recording.frames.length ?? 0;

  return (
    <>
      <ui-dialog
        heading={`${flow.fileError?.fileName ?? 'The file'} cannot be opened`}
        size="sm"
        open={flow.fileError !== null}
        onui-close={() => flow.dismissFileError()}
      >
        <ui-text>{flow.fileError?.reason} The current view is unchanged.</ui-text>
        <ui-button slot="footer" data-close onClick={() => flow.dismissFileError()}>
          Close
        </ui-button>
        <ui-button slot="footer" variant="primary" data-close onClick={() => flow.openFile()}>
          Open another file
        </ui-button>
      </ui-dialog>

      <ui-dialog
        heading="The recording was not saved"
        size="sm"
        open={unsaved !== null && !flow.saveErrorDeferred && !flow.discardRequested}
        onui-close={(event) => {
          if (event.detail.reason === 'dismiss' || event.detail.reason === 'escape') flow.deferSaveError();
        }}
      >
        <ui-text>
          {unsaved?.reason} The {formatClock(duration)} recording is kept in memory until you save or discard it.
        </ui-text>
        <ui-button slot="footer" variant="danger" onClick={() => flow.requestDiscard()}>
          Discard recording
        </ui-button>
        <ui-button slot="footer" variant="primary" disabled={flow.saving} onClick={() => flow.saveAgain()}>
          Save again
        </ui-button>
      </ui-dialog>

      <ui-dialog
        heading="Discard the recording?"
        size="sm"
        open={flow.discardRequested}
        onui-close={() => flow.cancelDiscard()}
      >
        <ui-text>
          The {formatClock(duration)} recording ({frames} frames) is deleted and cannot be restored.
        </ui-text>
        <ui-button slot="footer" onClick={() => flow.cancelDiscard()}>
          Keep
        </ui-button>
        <ui-button slot="footer" variant="danger" onClick={() => flow.discard()}>
          Discard recording
        </ui-button>
      </ui-dialog>
    </>
  );
}
