export interface CalibrationLeaveDialogProps {
  readonly open: boolean;
  /** "Keep waving", Escape or the close button. */
  readonly onKeep: () => void;
  /** "Stop calibration": the owner stops it and goes on with what the user wanted. */
  readonly onStop: () => void;
}

/** Asks before something else takes the stage while motion is being collected. */
export function CalibrationLeaveDialog({ open, onKeep, onStop }: CalibrationLeaveDialogProps) {
  return (
    <ui-dialog heading="Stop the calibration?" size="sm" open={open} onui-close={onKeep}>
      <ui-text>The motion collected so far is discarded. Nothing is applied and the previous calibration stays.</ui-text>
      <ui-button slot="footer" onClick={onKeep}>
        Keep waving
      </ui-button>
      <ui-button slot="footer" variant="danger" onClick={onStop}>
        Stop calibration
      </ui-button>
    </ui-dialog>
  );
}
