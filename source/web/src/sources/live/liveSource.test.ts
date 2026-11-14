import { PROTOCOL_VERSION } from '@ovr-driftless/core/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Frame, SessionInfo } from '../../domain/types';
import type { PoseSourceListener, SourceStatus } from '../source';
import { createLiveSource, type SocketLike } from './liveSource';

class FakeSocket implements SocketLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  send(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
  drop(): void {
    this.onerror?.();
    this.onclose?.();
  }
}

const SESSION: SessionInfo = {
  devices: [{ id: 'HMD', role: 'headset', trackingSystem: 'headset', name: 'Quest', serial: 'HMD', bodyPart: 'head' }],
  playAreas: [],
  floorHeight: 0,
};
const FRAME: Frame = { time: 1, devices: [{ id: 'HMD', state: 'tracking', pose: { position: [0, 1.6, 0], rotation: [0, 0, 0, 1] } }] };

function setup() {
  const sockets: FakeSocket[] = [];
  const statuses: SourceStatus[] = [];
  const sessions: SessionInfo[] = [];
  const frames: Frame[] = [];
  const listener: PoseSourceListener = {
    onStatus: (status) => statuses.push(status),
    onSession: (session) => sessions.push(session),
    onFrame: (frame) => frames.push(frame),
  };
  const source = createLiveSource({
    url: 'ws://test',
    reconnectSeconds: 2,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  return { source, listener, sockets, statuses, sessions, frames, last: () => sockets[sockets.length - 1] };
}

describe('createLiveSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is live and connects on start', () => {
    const { source, listener, statuses, sockets } = setup();
    expect(source.kind).toBe('live');
    source.start(listener);
    expect(statuses).toEqual([{ state: 'connecting' }]);
    expect(sockets).toHaveLength(1);
  });

  it('passes the core status, sessions and frames on after the hello', () => {
    const { source, listener, statuses, sessions, frames, last } = setup();
    source.start(listener);
    last()?.send({ type: 'frame', frame: FRAME });
    expect(frames).toHaveLength(0);
    last()?.send({ type: 'hello', protocol: PROTOCOL_VERSION, core: '0.1.0' });
    last()?.send({ type: 'status', state: 'unavailable', message: 'SteamVR is not running.' });
    last()?.send({ type: 'status', state: 'running' });
    last()?.send({ type: 'session', session: SESSION });
    last()?.send({ type: 'frame', frame: FRAME });
    expect(statuses.slice(1)).toEqual([{ state: 'unavailable', message: 'SteamVR is not running.' }, { state: 'running' }]);
    expect(sessions).toEqual([SESSION]);
    expect(frames).toEqual([FRAME]);
  });

  it('says the core is not running and tries again', () => {
    const { source, listener, statuses, sockets, last } = setup();
    source.start(listener);
    last()?.drop();
    expect(statuses.at(-1)?.state).toBe('unavailable');
    expect(statuses.at(-1)?.message).toContain('core is not running');
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);
  });

  it('refuses a core of another protocol and does not retry', () => {
    const { source, listener, statuses, sockets, last } = setup();
    source.start(listener);
    last()?.send({ type: 'hello', protocol: PROTOCOL_VERSION + 1, core: '9.0.0' });
    expect(statuses.at(-1)?.message).toContain(`protocol ${PROTOCOL_VERSION + 1}`);
    expect(last()?.closed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
  });

  it('ignores what is not a message', () => {
    const { source, listener, statuses, last } = setup();
    source.start(listener);
    last()?.onmessage?.({ data: 'not json' });
    last()?.onmessage?.({ data: JSON.stringify({ type: 'other' }) });
    expect(statuses).toHaveLength(1);
  });

  it('stops without reporting or retrying', () => {
    const { source, listener, statuses, sockets, last } = setup();
    source.start(listener);
    source.stop();
    expect(last()?.closed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(statuses).toHaveLength(1);
  });
});
