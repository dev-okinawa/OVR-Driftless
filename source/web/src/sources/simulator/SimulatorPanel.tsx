import { formatDegrees, formatMillimeters, type SelectOption, type TableColumn, type TableRow } from '@ai-designer/ui';
import { html } from 'lit';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Pose } from '../../domain/types';
import { MOTION_PRESETS } from './model';
import type { MotionPreset } from './model';
import type { SimulatorControls } from './simulatorSource';
import styles from './SimulatorPanel.module.css';

const MISALIGNMENT_REFRESH_MS = 250;

interface Misalignment {
  readonly offsetMm: number;
  readonly yawDeg: number;
}

/** The transform is gravity-aligned, so its rotation is a yaw and its translation is horizontal. */
function readMisalignment(pose: Pose): Misalignment {
  const [, y, , w] = pose.rotation;
  const rawDeg = (2 * Math.atan2(y, w) * 180) / Math.PI;
  const yawDeg = ((((rawDeg + 180) % 360) + 360) % 360) - 180;
  return { offsetMm: Math.hypot(pose.position[0], pose.position[2]) * 1000, yawDeg };
}

const MOTION_LABELS: Readonly<Record<MotionPreset, string>> = {
  stand: 'Stand still',
  walk: 'Walk in a circle',
  squat: 'Squat and stand up',
  reach: 'Reach behind the back',
  wave: 'Wave the right hand',
};

const MOTION_OPTIONS: SelectOption[] = MOTION_PRESETS.map((value) => ({ value, label: MOTION_LABELS[value] }));

const JUMP_PRESETS: readonly { readonly label: string; readonly yawDeg: number; readonly offsetMm: number }[] = [
  { label: 'Yaw +5°', yawDeg: 5, offsetMm: 0 },
  { label: 'Yaw −5°', yawDeg: -5, offsetMm: 0 },
  { label: 'Yaw 30°', yawDeg: 30, offsetMm: 0 },
  { label: 'Offset 100 mm', yawDeg: 0, offsetMm: 100 },
  { label: '5° + 100 mm', yawDeg: 5, offsetMm: 100 },
];

type DeviceFlag = 'tracked' | 'connected' | 'present';

/** A number a field committed, or null when the field is empty or not a number. */
function parseNumber(text: string): number | null {
  const value = Number(text);
  return text !== '' && Number.isFinite(value) ? value : null;
}

/** The columns of the device table. The kit renders cells with its own templates, so these are lit templates. */
function deviceColumns(controls: SimulatorControls): TableColumn[] {
  const setters: Record<DeviceFlag, (deviceId: string, value: boolean) => void> = {
    tracked: (id, value) => controls.setDeviceTracking(id, value),
    connected: (id, value) => controls.setDeviceConnected(id, value),
    present: (id, value) => controls.setDevicePresent(id, value),
  };
  const flag = (row: TableRow, key: DeviceFlag) => html`
    <ui-checkbox
      size="sm"
      hide-label
      label="${String(row.id)} ${key}"
      .checked=${row[key] === true}
      @ui-change=${(event: CustomEvent<{ value: boolean }>) => setters[key](String(row.id), event.detail.value)}
    ></ui-checkbox>
  `;
  return [
    {
      id: 'device',
      label: 'Device',
      render: (row) => html`${String(row.id)}<ui-text variant="caption" tone="muted">${String(row.name)}</ui-text>`,
    },
    { id: 'tracked', label: 'Tracked', align: 'center', render: (row) => flag(row, 'tracked') },
    { id: 'connected', label: 'Connected', align: 'center', render: (row) => flag(row, 'connected') },
    { id: 'present', label: 'Present', align: 'center', render: (row) => flag(row, 'present') },
  ];
}

/**
 * The simulator controls: motion, drift of the Lighthouse space, headset jumps and the per-device flags.
 * Returns the content of a tab; its owner arranges the groups.
 */
export function SimulatorPanel({ controls }: { readonly controls: SimulatorControls }) {
  const state = useSyncExternalStore(controls.subscribe, controls.getState);
  const [misalignment, setMisalignment] = useState(() => readMisalignment(controls.getTrueMisalignment()));
  const [jumpYaw, setJumpYaw] = useState('5');
  const [jumpOffset, setJumpOffset] = useState('100');
  const columns = useMemo(() => deviceColumns(controls), [controls]);
  const rows = useMemo(() => state.devices.map((device) => ({ ...device })), [state.devices]);

  useEffect(() => {
    const handle = setInterval(
      () => setMisalignment(readMisalignment(controls.getTrueMisalignment())),
      MISALIGNMENT_REFRESH_MS,
    );
    return () => clearInterval(handle);
  }, [controls]);

  return (
    <>
      <ui-select
        label="Motion"
        options={MOTION_OPTIONS}
        value={state.motion}
        onui-change={(event) => controls.setMotion(event.detail.value as MotionPreset)}
      />
      <div className={styles.group}>
        <ui-switch label="Pause body" checked={state.paused} onui-change={(event) => controls.setPaused(event.detail.value)} />
        <ui-switch
          label="Waist tracker attached to right controller"
          checked={state.pairAttached}
          onui-change={(event) => controls.setPairAttached(event.detail.value)}
        />
      </div>

      <div className={styles.group}>
        <ui-heading level={3} size="sm">
          Drift of the Lighthouse space
        </ui-heading>
        <ui-text-field
          type="number"
          size="sm"
          inline
          className={styles.numberField}
          label="Yaw"
          unit="°/min"
          step="0.1"
          value={String(state.driftRate.yawDegPerMinute)}
          onui-change={(event) => {
            const yawDegPerMinute = parseNumber(event.detail.value);
            if (yawDegPerMinute !== null) controls.setDriftRate({ ...state.driftRate, yawDegPerMinute });
          }}
        />
        <ui-text-field
          type="number"
          size="sm"
          inline
          className={styles.numberField}
          label="Position"
          unit="mm/min"
          step="1"
          value={String(state.driftRate.positionMmPerMinute)}
          onui-change={(event) => {
            const positionMmPerMinute = parseNumber(event.detail.value);
            if (positionMmPerMinute !== null) controls.setDriftRate({ ...state.driftRate, positionMmPerMinute });
          }}
        />
      </div>

      <div className={styles.group}>
        <ui-heading level={3} size="sm">
          Headset jump
        </ui-heading>
        <div className={styles.row}>
          {JUMP_PRESETS.map((preset) => (
            <ui-button
              key={preset.label}
              size="sm"
              onClick={() => controls.jump({ yawDeg: preset.yawDeg, offsetMm: preset.offsetMm })}
            >
              {preset.label}
            </ui-button>
          ))}
        </div>
        <ui-text-field
          type="number"
          size="sm"
          inline
          className={styles.numberField}
          label="Yaw"
          unit="°"
          step="0.1"
          value={jumpYaw}
          onui-change={(event) => setJumpYaw(event.detail.value)}
        />
        <ui-text-field
          type="number"
          size="sm"
          inline
          className={styles.numberField}
          label="Offset"
          unit="mm"
          step="1"
          value={jumpOffset}
          onui-change={(event) => setJumpOffset(event.detail.value)}
        />
        <div className={styles.row}>
          <ui-button
            size="sm"
            onClick={() => controls.jump({ yawDeg: parseNumber(jumpYaw) ?? 0, offsetMm: parseNumber(jumpOffset) ?? 0 })}
          >
            Jump
          </ui-button>
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.row}>
          <ui-button onClick={() => controls.resetMisalignment()}>Reset misalignment</ui-button>
        </div>
        <ui-stat
          inline
          label="True misalignment"
          value={`${formatMillimeters(misalignment.offsetMm)} mm · ${formatDegrees(misalignment.yawDeg)}°`}
        />
      </div>

      <ui-table dense caption="Simulated devices" rowKey="id" columns={columns} rows={rows} />
    </>
  );
}
