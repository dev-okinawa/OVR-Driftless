import { formatClock, type UiButton } from '@ai-designer/ui';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReplayControls } from '../sources/replay/replaySource';
import styles from './ReplayBar.module.css';

export interface ReplayBarProps {
  readonly controls: ReplayControls;
  /** The recording ends where its file was cut. */
  readonly interrupted: boolean;
  /** When the recording was made, for the line above the controls. */
  readonly recordedAt: string;
  readonly onClose: () => void;
  /** Text of the button that leaves the replay; names the source the user returns to. */
  readonly closeLabel: string;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const SPEED_OPTIONS = SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }));

/** The replay transport: play or pause, position, time, speed and the way back to the previous source. */
export function ReplayBar({ controls, interrupted, recordedAt, onClose, closeLabel }: ReplayBarProps) {
  const { playing, time, duration, speed } = useSyncExternalStore(controls.subscribe, controls.getSnapshot);
  const playRef = useRef<UiButton>(null);
  const position = `${formatClock(time)} / ${formatClock(duration)}`;
  const eyebrow = interrupted
    ? `Interrupted recording: it ends where the file was cut, at ${formatClock(duration)}.`
    : `Recorded ${recordedAt} · length ${formatClock(duration)}`;

  // The replay opens from a file dialog; focus goes to its first control.
  useEffect(() => playRef.current?.focus(), []);

  return (
    <ui-floating-panel slot="above-bottom" className={styles.plate} label="Replay controls" eyebrow={eyebrow}>
      <div className={styles.row}>
        <ui-button
          ref={playRef}
          size="md"
          icon={playing ? 'pause' : 'play'}
          onClick={playing ? controls.pause : controls.play}
        >
          {playing ? 'Pause' : 'Play'}
        </ui-button>
        <ui-slider
          label="Position"
          hideLabel
          inline
          min={0}
          max={duration}
          step="any"
          value={time}
          valueText={position}
          disabled={duration === 0}
          onui-input={(event) => controls.seek(event.detail.value)}
          onui-change={(event) => controls.seek(event.detail.value)}
        />
        <ui-segmented-control
          size="sm"
          label="Speed"
          hideLabel
          options={SPEED_OPTIONS}
          value={String(speed)}
          onui-change={(event) => controls.setSpeed(Number(event.detail.value))}
        />
        <ui-button variant="ghost" icon="close" onClick={onClose}>
          {closeLabel}
        </ui-button>
      </div>
    </ui-floating-panel>
  );
}
