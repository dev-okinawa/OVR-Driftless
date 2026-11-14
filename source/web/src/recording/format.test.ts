import { describe, expect, it } from 'vitest';
import type { Frame, SessionInfo } from '../domain/types';
import { parseRecording, RecordingFormatError, serializeRecording, type Recording } from './format';

const session: SessionInfo = {
  devices: [{ id: 'hmd', role: 'headset', trackingSystem: 'headset', name: 'Quest', serial: 'A1' }],
  playAreas: [{ trackingSystem: 'headset', corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1]] }],
  floorHeight: 0,
};

function frame(time: number, pose = true): Frame {
  return {
    time,
    devices: [{ id: 'hmd', state: 'tracking', pose: pose ? { position: [0, 1, 2], rotation: [0, 0, 0, 1] } : null }],
  };
}

const recording: Recording = {
  createdAt: '2026-01-01T00:00:00.000Z',
  sessions: [{ time: 0, session }],
  frames: [frame(0), frame(0.1), frame(0.2, false)],
  annotations: [{ time: 0.1, kind: 'pair', data: { a: 'hmd', b: [1, 2] } }],
  truncated: false,
};

describe('recording format', () => {
  it('round-trips', () => {
    expect(parseRecording(serializeRecording(recording))).toEqual(recording);
  });

  it('keeps null poses', () => {
    const parsed = parseRecording(serializeRecording(recording));
    expect(parsed.frames[2]?.devices[0]?.pose).toBeNull();
  });

  it('reads a file cut mid-line up to the last complete line', () => {
    const text = serializeRecording(recording);
    const cut = text.slice(0, text.length - 15);
    const parsed = parseRecording(cut);
    expect(parsed.truncated).toBe(true);
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.annotations).toHaveLength(1);
  });

  it('rejects a file that is not a recording', () => {
    expect(() => parseRecording('hello world')).toThrow(RecordingFormatError);
    expect(() => parseRecording('')).toThrow(RecordingFormatError);
    expect(() => parseRecording('{"format":"other","version":1,"createdAt":"x"}\n')).toThrow(RecordingFormatError);
  });

  it('rejects a wrong version', () => {
    const text = serializeRecording(recording).replace('"version":1', '"version":2');
    expect(() => parseRecording(text)).toThrow(/version/);
  });

  it('rejects a frame before any session', () => {
    const header = '{"format":"ovr-driftless-recording","version":1,"createdAt":"x"}';
    const text = `${header}\n${JSON.stringify({ type: 'frame', frame: frame(0) })}\n`;
    expect(() => parseRecording(text)).toThrow(RecordingFormatError);
  });

  it('rejects a malformed sample', () => {
    const bad = serializeRecording(recording).replace('"rotation":[0,0,0,1]', '"rotation":[0,0,1]');
    expect(() => parseRecording(bad)).toThrow(RecordingFormatError);
  });
});
