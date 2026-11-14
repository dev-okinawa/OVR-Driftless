export interface CalibrationRemoveDialogProps {
  readonly open: boolean;
  readonly onRemove: () => void;
  /** "Keep calibration", Escape or the close button. */
  readonly onKeep: () => void;
}

/** Confirms removing the correction of the Lighthouse devices. */
export function CalibrationRemoveDialog({ open, onRemove, onKeep }: CalibrationRemoveDialogProps) {
  return (
    <ui-dialog heading="Remove the calibration?" size="sm" open={open} onui-close={onKeep}>
      <ui-text>
        The Lighthouse devices return to where Lighthouse places them, uncorrected. The headset and its controllers do not
        move. To align the spaces again you calibrate again.
      </ui-text>
      <ui-button slot="footer" onClick={onKeep}>
        Keep calibration
      </ui-button>
      <ui-button slot="footer" variant="danger" onClick={onRemove}>
        Remove calibration
      </ui-button>
    </ui-dialog>
  );
}
