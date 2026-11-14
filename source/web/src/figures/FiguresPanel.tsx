import { formatClock, formatDegrees, formatMillimeters, type UiButton, type UiChoiceGroup } from '@ai-designer/ui';
import { useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import type { DeviceState, TrackingSystem } from '../domain/types';
import type { PairFigures } from './pairFigures';
import styles from './FiguresPanel.module.css';

/** A device that can be one half of the pair, as the picker shows it. */
export interface PairDevice {
  readonly id: string;
  /** Short name under the mark. */
  readonly name: string;
  /** Full name, for messages. */
  readonly label: string;
  readonly system: TrackingSystem;
  readonly state: DeviceState;
  readonly mark: ReactNode;
}

export interface FiguresPanelProps {
  readonly figures: PairFigures;
  /** Devices that track something: base stations are not among them. */
  readonly devices: readonly PairDevice[];
  /** A replay shows the recorded pair and reference; they cannot be changed. */
  readonly replay: boolean;
  /** The current session time in seconds; null before the first frame. */
  readonly getTime: () => number | null;
  readonly onAnnounce: (text: string) => void;
}

interface PickerProps {
  readonly side: 'a' | 'b';
  readonly label: string;
  readonly devices: readonly PairDevice[];
  readonly emptyHint: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChoose: (id: string) => void;
  readonly groupRef?: Ref<UiChoiceGroup>;
}

function DevicePicker({ side, label, devices, emptyHint, value, disabled, onChoose, groupRef }: PickerProps) {
  return (
    <ui-choice-group
      ref={groupRef}
      data-pair={side}
      label={label}
      value={value}
      disabled={disabled || devices.length === 0}
      hint={devices.length === 0 ? emptyHint : ''}
      onui-change={(event) => onChoose(event.detail.value)}
    >
      {devices.map((device) => (
        <ui-choice key={device.id} value={device.id} label={device.name}>
          <span slot="icon">{device.mark}</span>
        </ui-choice>
      ))}
    </ui-choice-group>
  );
}

/**
 * Pair drift: the two devices of the declared pair, the reference, and the figures with their register mark.
 * Returns the content of a tab; its owner arranges the groups.
 */
export function FiguresPanel({ figures, devices, replay, getTime, onAnnounce }: FiguresPanelProps) {
  const snapshot = useSyncExternalStore(figures.subscribe, figures.getSnapshot);
  const [draft, setDraft] = useState({ a: '', b: '' });
  const setReferenceRef = useRef<UiButton>(null);
  const pickerARef = useRef<UiChoiceGroup>(null);

  const headsetDevices = devices.filter((device) => device.system === 'headset');
  const lighthouseDevices = devices.filter((device) => device.system === 'lighthouse');
  const chosen = { a: snapshot.pair?.deviceIdA ?? draft.a, b: snapshot.pair?.deviceIdB ?? draft.b };

  const choose = (side: 'a' | 'b', id: string): void => {
    const next = { ...chosen, [side]: id };
    setDraft(next);
    if (next.a && next.b) figures.setPair(next.a, next.b);
    else figures.clearPair();
  };

  let blockedReason: string | null = null;
  if (replay) {
    blockedReason = 'A replay shows the recorded pair and reference.';
  } else if (headsetDevices.length === 0 || lighthouseDevices.length === 0) {
    blockedReason = `A pair needs a device of each tracking system. ${headsetDevices.length === 0 ? 'No headset-tracked device' : 'No Lighthouse device'} is connected.`;
  } else if (!snapshot.pair) {
    blockedReason = 'Choose both devices of the pair first.';
  } else if (!snapshot.canSetReference) {
    const notTracking = devices.find(
      (device) =>
        (device.id === snapshot.pair?.deviceIdA || device.id === snapshot.pair?.deviceIdB) && device.state !== 'tracking',
    );
    blockedReason = notTracking ? `${notTracking.label} is not tracking.` : 'A device of the pair is not connected.';
  }

  const setReference = (): void => {
    if (!figures.setReference()) return;
    onAnnounce(`Reference set at ${formatClock(getTime())}`);
  };

  const clearReference = (): void => {
    figures.clearReference();
    onAnnounce('Reference cleared');
    // "Set reference" may stay disabled (a device of the pair is not tracking): fall back to the first picker.
    requestAnimationFrame(() => (blockedReason === null ? setReferenceRef.current : pickerARef.current)?.focus());
  };

  const { current } = snapshot;
  const status = !snapshot.hasReference ? 'no-reference' : current ? 'measuring' : 'gap';
  const hint = blockedReason ?? (snapshot.hasReference ? 'Set it again to start from now.' : 'Press while the spaces are aligned.');
  let stateLine: string | null = null;
  if (snapshot.pair && snapshot.hasReference) {
    stateLine = current ? 'Both devices are tracking.' : 'A device of the pair is not tracking; the graph shows a gap.';
  }

  return (
    <>
      <ui-text variant="small" tone="muted">
        The figures mean something only for two devices rigidly attached to each other, for example a tracker fixed to a
        controller. The scene does not check this.
      </ui-text>

      <div className={styles.group}>
        <DevicePicker
          side="a"
          label="Device A (headset tracking)"
          devices={headsetDevices}
          emptyHint="No headset-tracked device is connected."
          value={chosen.a}
          disabled={replay}
          onChoose={(id) => choose('a', id)}
          groupRef={pickerARef}
        />
        <DevicePicker
          side="b"
          label="Device B (Lighthouse)"
          devices={lighthouseDevices}
          emptyHint="No Lighthouse device is connected."
          value={chosen.b}
          disabled={replay}
          onChoose={(id) => choose('b', id)}
        />
      </div>

      <div className={styles.group}>
        <div className={styles.row}>
          <ui-button ref={setReferenceRef} variant="primary" disabled={blockedReason !== null} onClick={setReference}>
            Set reference
          </ui-button>
          {snapshot.hasReference && !replay && (
            <ui-button variant="ghost" onClick={clearReference}>
              Clear reference
            </ui-button>
          )}
        </div>
        <ui-text variant="small" tone="muted">
          {hint}
        </ui-text>
      </div>

      <div className={styles.group}>
        <div className={styles.figures}>
          <ui-register-mark
            size="lg"
            status={status}
            distance={current?.distanceMm ?? null}
            angle={current?.angleDeg ?? null}
          />
          <div className={styles.values}>
            <ui-stat label="Distance" value={formatMillimeters(current?.distanceMm)} unit="mm" />
            <ui-stat label="Angle" value={formatDegrees(current?.angleDeg)} unit="°" />
          </div>
        </div>
        {stateLine && <ui-text variant="small">{stateLine}</ui-text>}
      </div>
    </>
  );
}
