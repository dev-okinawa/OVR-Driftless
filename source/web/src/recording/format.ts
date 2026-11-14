import type { DeviceSample, DeviceState, Frame, Pose, SessionInfo } from '../domain/types';

// File format: JSON Lines. One JSON object per line, so a file cut off mid-write
// stays readable up to its last complete line.

export interface RecordingAnnotation {
  readonly time: number;
  readonly kind: string;
  /** Stored and returned untouched. */
  readonly data: unknown;
}

export interface Recording {
  readonly createdAt: string;
  readonly sessions: readonly { readonly time: number; readonly session: SessionInfo }[];
  readonly frames: readonly Frame[];
  readonly annotations: readonly RecordingAnnotation[];
  /** True when the file ended in an incomplete line: an interrupted recording. */
  readonly truncated: boolean;
}

export class RecordingFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingFormatError';
  }
}

const FORMAT_NAME = 'ovr-driftless-recording';
const FORMAT_VERSION = 1;
const DEVICE_STATES: readonly string[] = ['tracking', 'tracking-lost', 'disconnected'] satisfies DeviceState[];

export function serializeRecording(recording: Recording): string {
  const entries: { time: number; order: number; line: string }[] = [];
  let order = 0;
  const add = (time: number, entry: unknown): void => {
    entries.push({ time, order: order++, line: JSON.stringify(entry) });
  };
  // A session goes before a frame of the same time, so the frame always has its session.
  for (const { time, session } of recording.sessions) add(time, { type: 'session', time, session });
  for (const frame of recording.frames) add(frame.time, { type: 'frame', frame });
  for (const a of recording.annotations) add(a.time, { type: 'annotation', time: a.time, kind: a.kind, data: a.data });
  entries.sort((a, b) => a.time - b.time || a.order - b.order);

  const header = { format: FORMAT_NAME, version: FORMAT_VERSION, createdAt: recording.createdAt };
  return [JSON.stringify(header), ...entries.map((e) => e.line)].join('\n') + '\n';
}

export function parseRecording(text: string): Recording {
  const lines = text.split('\n');
  const endsWithNewline = lines[lines.length - 1] === '';
  if (endsWithNewline) lines.pop();
  // Tolerate files written with CRLF.
  const trimmed = lines.map((l) => l.replace(/\r$/, ''));
  if (trimmed.length === 0 || trimmed[0] === '') throw new RecordingFormatError('The file is empty, it is not a recording.');

  let truncated = false;
  const parsed: unknown[] = [];
  trimmed.forEach((line, index) => {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      const isLast = index === trimmed.length - 1;
      if (isLast && index > 0) truncated = true;
      else throw new RecordingFormatError('The file is not a recording: it is not valid JSON Lines.');
    }
  });

  const header = parsed[0];
  if (!isRecord(header) || header.format !== FORMAT_NAME) {
    throw new RecordingFormatError('The file is not a tracker recording.');
  }
  if (header.version !== FORMAT_VERSION) {
    throw new RecordingFormatError(`Unsupported recording version ${String(header.version)}; this application reads version ${FORMAT_VERSION}.`);
  }
  if (typeof header.createdAt !== 'string') throw new RecordingFormatError('The recording header has no creation time.');

  const sessions: { time: number; session: SessionInfo }[] = [];
  const frames: Frame[] = [];
  const annotations: RecordingAnnotation[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const entry = parsed[i];
    const where = `line ${i + 1}`;
    if (!isRecord(entry)) throw new RecordingFormatError(`Malformed entry at ${where}.`);
    switch (entry.type) {
      case 'session': {
        if (!isFiniteNumber(entry.time)) throw new RecordingFormatError(`Session entry without a time at ${where}.`);
        sessions.push({ time: entry.time, session: readSession(entry.session, where) });
        break;
      }
      case 'frame': {
        if (sessions.length === 0) throw new RecordingFormatError(`A frame at ${where} comes before any session.`);
        frames.push(readFrame(entry.frame, where));
        break;
      }
      case 'annotation': {
        if (!isFiniteNumber(entry.time) || typeof entry.kind !== 'string') {
          throw new RecordingFormatError(`Malformed annotation at ${where}.`);
        }
        annotations.push({ time: entry.time, kind: entry.kind, data: entry.data });
        break;
      }
      default:
        throw new RecordingFormatError(`Unknown entry type at ${where}.`);
    }
  }

  return { createdAt: header.createdAt, sessions, frames, annotations, truncated };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberArray(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

function readSession(value: unknown, where: string): SessionInfo {
  if (
    !isRecord(value) ||
    !Array.isArray(value.devices) ||
    !Array.isArray(value.playAreas) ||
    !isFiniteNumber(value.floorHeight)
  ) {
    throw new RecordingFormatError(`Malformed session at ${where}.`);
  }
  for (const device of value.devices) {
    if (!isRecord(device) || typeof device.id !== 'string') throw new RecordingFormatError(`Malformed device at ${where}.`);
  }
  for (const area of value.playAreas) {
    if (!isRecord(area) || !Array.isArray(area.corners) || !area.corners.every((c) => isNumberArray(c, 3))) {
      throw new RecordingFormatError(`Malformed play area at ${where}.`);
    }
  }
  return value as unknown as SessionInfo;
}

function readFrame(value: unknown, where: string): Frame {
  if (!isRecord(value) || !isFiniteNumber(value.time) || !Array.isArray(value.devices)) {
    throw new RecordingFormatError(`Malformed frame at ${where}.`);
  }
  const devices: DeviceSample[] = value.devices.map((sample: unknown) => {
    if (!isRecord(sample) || typeof sample.id !== 'string' || typeof sample.state !== 'string' || !DEVICE_STATES.includes(sample.state)) {
      throw new RecordingFormatError(`Malformed device sample at ${where}.`);
    }
    return { id: sample.id, state: sample.state as DeviceState, pose: readPose(sample.pose, where) };
  });
  return { time: value.time, devices };
}

function readPose(value: unknown, where: string): Pose | null {
  if (value === null) return null;
  if (!isRecord(value) || !isNumberArray(value.position, 3) || !isNumberArray(value.rotation, 4)) {
    throw new RecordingFormatError(`Malformed pose at ${where}.`);
  }
  return value as unknown as Pose;
}
