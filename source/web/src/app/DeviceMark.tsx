import type { DeviceView } from '../scene/deviceView';

export interface DeviceMarkProps {
  readonly device: DeviceView;
  readonly size: 'sm' | 'md' | 'lg';
  /** The slot of the parent element the mark goes into. */
  readonly slot?: string;
}

/** The mark of a device: shape by role, outline by tracking system, dashed or ghost when not tracking. */
export function DeviceMark({ device, size, slot }: DeviceMarkProps) {
  const { mark } = device;
  return (
    <ui-device-mark
      slot={slot}
      size={size}
      shape={mark.shape}
      tone={mark.tone}
      state={mark.state}
      code={mark.code}
      icon={mark.icon}
      label={device.label}
    />
  );
}
