import { describe, expect, it } from 'vitest';
import type { DeviceInfo } from '../domain/types';
import { deviceViews } from './deviceView';

const devices: readonly DeviceInfo[] = [
  { id: 'hmd', role: 'headset', trackingSystem: 'headset', name: 'Quest 3', serial: 'H1', bodyPart: 'head' },
  { id: 'left', role: 'controller', trackingSystem: 'headset', name: 'Touch', serial: 'C1', bodyPart: 'left-hand' },
  { id: 'waist', role: 'tracker', trackingSystem: 'lighthouse', name: 'Vive Tracker', serial: 'T1', bodyPart: 'waist' },
  { id: 'foot', role: 'tracker', trackingSystem: 'lighthouse', name: 'Vive Tracker', serial: 'T2', bodyPart: 'right-foot' },
  { id: 'loose', role: 'tracker', trackingSystem: 'lighthouse', name: 'Vive Tracker', serial: 'T3' },
  { id: 'base', role: 'base-station', trackingSystem: 'lighthouse', name: 'Base Station 2.0', serial: 'B1' },
];

describe('deviceViews', () => {
  const views = deviceViews(devices, { hmd: 'tracking', left: 'tracking-lost', waist: 'tracking' });
  const byId = (id: string) => views.find((view) => view.info.id === id);

  it('names devices by role, number and body part', () => {
    expect(byId('hmd')?.label).toBe('Headset');
    expect(byId('left')?.label).toBe('Controller · left hand');
    expect(byId('foot')?.label).toBe('Tracker 2 · right foot');
    expect(byId('loose')?.label).toBe('Tracker 3 · T3');
    expect(byId('base')?.label).toBe('Base station 1');
  });

  it('gives a short name for the dock', () => {
    expect(byId('left')?.shortName).toBe('Left');
    expect(byId('foot')?.shortName).toBe('R foot');
    expect(byId('loose')?.shortName).toBe('Tracker 3');
    expect(byId('base')?.shortName).toBe('Base 1');
  });

  it('puts a code in the mark of controllers and trackers only', () => {
    expect(byId('left')?.mark.code).toBe('L');
    expect(byId('foot')?.mark.code).toBe('2');
    expect(byId('hmd')?.mark.code).toBe('');
    expect(byId('base')?.mark.code).toBe('');
  });

  it('maps the device state to the mark state, unknown as disconnected', () => {
    expect(byId('hmd')?.mark.state).toBe('normal');
    expect(byId('left')?.mark.state).toBe('lost');
    expect(byId('foot')?.state).toBe('disconnected');
    expect(byId('foot')?.mark.state).toBe('off');
  });

  it('describes the device with name, serial, system and state', () => {
    expect(byId('left')?.description).toBe('Controller · left hand · Touch · serial C1 · Headset tracking · Tracking lost');
  });
});
