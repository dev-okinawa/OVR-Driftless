import type { IconName, MarkShape, MarkState } from '@ai-designer/ui';
import type { BodyPart, DeviceInfo, DeviceRole, DeviceState, TrackingSystem } from '../domain/types';

/** A device as the interface names and draws it: the same label and mark in the dock and in the pair pickers. */
export interface DeviceView {
  readonly info: DeviceInfo;
  readonly state: DeviceState;
  /** "Headset", "Controller · left hand", "Tracker 1 · waist", "Base station 1". */
  readonly label: string;
  /** "Headset", "Left", "Waist", "Base 1": under a mark in the dock. */
  readonly shortName: string;
  /** Full description for a tooltip: name, model, serial, tracking system and state. */
  readonly description: string;
  readonly mark: {
    readonly shape: MarkShape;
    readonly tone: TrackingSystem;
    readonly state: MarkState;
    /** `L` or `R` for a controller, the number of a tracker, nothing for the headset and base stations. */
    readonly code: string;
    readonly icon: IconName;
  };
}

const ROLE_LABELS: Readonly<Record<DeviceRole, string>> = {
  headset: 'Headset',
  controller: 'Controller',
  tracker: 'Tracker',
  'base-station': 'Base station',
};

const BODY_PART_LABELS: Readonly<Record<BodyPart, string>> = {
  head: 'head',
  'left-hand': 'left hand',
  'right-hand': 'right hand',
  chest: 'chest',
  waist: 'waist',
  'left-foot': 'left foot',
  'right-foot': 'right foot',
};

const SHORT_BODY_PART_LABELS: Readonly<Record<BodyPart, string>> = {
  head: 'Head',
  'left-hand': 'Left',
  'right-hand': 'Right',
  chest: 'Chest',
  waist: 'Waist',
  'left-foot': 'L foot',
  'right-foot': 'R foot',
};

const SYSTEM_LABELS: Readonly<Record<TrackingSystem, string>> = { headset: 'Headset tracking', lighthouse: 'Lighthouse' };

const STATE_LABELS: Readonly<Record<DeviceState, string>> = {
  tracking: 'Tracking',
  'tracking-lost': 'Tracking lost',
  disconnected: 'Disconnected',
};

const MARK_STATES: Readonly<Record<DeviceState, MarkState>> = {
  tracking: 'normal',
  'tracking-lost': 'lost',
  disconnected: 'off',
};

/** Position of `device` among the devices of its role, counted from one. */
function ordinalAmongRole(device: DeviceInfo, devices: readonly DeviceInfo[]): number {
  return devices.filter((candidate) => candidate.role === device.role).indexOf(device) + 1;
}

function markCode(device: DeviceInfo, devices: readonly DeviceInfo[]): string {
  if (device.role === 'controller') {
    if (device.bodyPart === 'left-hand') return 'L';
    return device.bodyPart === 'right-hand' ? 'R' : '';
  }
  return device.role === 'tracker' ? String(ordinalAmongRole(device, devices)) : '';
}

function labelOf(device: DeviceInfo, devices: readonly DeviceInfo[]): string {
  if (device.role === 'headset') return ROLE_LABELS.headset;
  if (device.role === 'base-station') return `${ROLE_LABELS['base-station']} ${ordinalAmongRole(device, devices)}`;
  const role = device.role === 'tracker' ? `${ROLE_LABELS.tracker} ${markCode(device, devices)}` : ROLE_LABELS.controller;
  return `${role} · ${device.bodyPart ? BODY_PART_LABELS[device.bodyPart] : device.serial}`;
}

function shortNameOf(device: DeviceInfo, devices: readonly DeviceInfo[]): string {
  if (device.role === 'headset') return 'Headset';
  if (device.role === 'base-station') return `Base ${ordinalAmongRole(device, devices)}`;
  return device.bodyPart ? SHORT_BODY_PART_LABELS[device.bodyPart] : `${ROLE_LABELS[device.role]} ${ordinalAmongRole(device, devices)}`;
}

/** The view of one device of `devices` in `state`; the one place that names and codes devices. */
export function deviceView(info: DeviceInfo, devices: readonly DeviceInfo[], state: DeviceState): DeviceView {
  const label = labelOf(info, devices);
  return {
    info,
    state,
    label,
    shortName: shortNameOf(info, devices),
    description: `${label} · ${info.name} · serial ${info.serial} · ${SYSTEM_LABELS[info.trackingSystem]} · ${STATE_LABELS[state]}`,
    mark: {
      shape: info.role,
      tone: info.trackingSystem,
      state: MARK_STATES[state],
      code: markCode(info, devices),
      icon: info.role,
    },
  };
}

/** The views of every device of a session, in session order. A device without a known state counts as disconnected. */
export function deviceViews(
  devices: readonly DeviceInfo[],
  deviceStates: Readonly<Record<string, DeviceState>>,
): readonly DeviceView[] {
  return devices.map((info) => deviceView(info, devices, deviceStates[info.id] ?? 'disconnected'));
}
