import { DeviceMark } from './DeviceMark';
import type { DeviceView } from '../scene/deviceView';

export interface DeviceDockProps {
  readonly devices: readonly DeviceView[];
  /** Devices drawn as selected: the one chosen in the dock and the devices of the declared pair. */
  readonly highlightedIds: ReadonlySet<string>;
  readonly onSelect: (deviceId: string, selected: boolean) => void;
  readonly calibrated: boolean;
  readonly onCalibrate: (opener: HTMLElement) => void;
}

/**
 * The device dock, bottom centre: a tile per device with its mark, short name and LOST / OFF tag, then the Calibrate
 * action: primary until the product has calibrated, secondary (Recalibrate) after.
 */
export function DeviceDock({ devices, highlightedIds, onSelect, calibrated, onCalibrate }: DeviceDockProps) {
  return (
    <ui-device-dock slot="bottom" label="Devices">
      {devices.length === 0 && (
        <ui-text variant="small" tone="muted" inline>
          No devices
        </ui-text>
      )}
      {devices.map((device) => (
        <ui-device-tile
          key={device.info.id}
          value={device.info.id}
          label={device.shortName}
          description={device.description}
          state={device.mark.state}
          selected={highlightedIds.has(device.info.id)}
          onui-select={(event) => onSelect(event.detail.value, event.detail.selected)}
        >
          <DeviceMark slot="mark" size="lg" device={device} />
        </ui-device-tile>
      ))}
      <ui-dock-action
        slot="end"
        data-open="calibration"
        emphasis={calibrated ? 'secondary' : 'primary'}
        icon="register"
        onClick={(event) => onCalibrate(event.currentTarget)}
      >
        {calibrated ? 'Recalibrate' : 'Calibrate'}
      </ui-dock-action>
    </ui-device-dock>
  );
}
