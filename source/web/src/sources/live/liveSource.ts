import { PROTOCOL_VERSION, type CoreMessage } from '@ovr-driftless/core/protocol';
import type { PoseSource, PoseSourceListener } from '../source';

/** The part of the browser's WebSocket the source uses, so that tests can stand in for it. */
export interface SocketLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface LiveSourceOptions {
  /** Where the core listens. */
  readonly url: string;
  /** Wait between attempts to reach the core, seconds. */
  readonly reconnectSeconds?: number;
  readonly createSocket?: (url: string) => SocketLike;
}

export const DEFAULT_CORE_URL = 'ws://127.0.0.1:47115';
const DEFAULT_RECONNECT_SECONDS = 2;
const CORE_NOT_RUNNING = 'The OVR Driftless core is not running. Start the application with npm run dev.';

const MESSAGE_TYPES: ReadonlySet<string> = new Set(['hello', 'status', 'session', 'frame']);

function parse(data: unknown): CoreMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return null;
    const type = (value as { type?: unknown }).type;
    return typeof type === 'string' && MESSAGE_TYPES.has(type) ? (value as CoreMessage) : null;
  } catch {
    return null;
  }
}

function browserSocket(url: string): SocketLike {
  const socket = new WebSocket(url);
  const like: SocketLike = { onmessage: null, onclose: null, onerror: null, close: () => socket.close() };
  socket.onmessage = (event) => like.onmessage?.({ data: event.data });
  socket.onclose = () => like.onclose?.();
  socket.onerror = () => like.onerror?.();
  return like;
}

/** Live poses from SteamVR through the core's WebSocket. Reconnects on its own until stopped. */
export function createLiveSource(options: LiveSourceOptions): PoseSource {
  const reconnectMs = (options.reconnectSeconds ?? DEFAULT_RECONNECT_SECONDS) * 1000;
  const createSocket = options.createSocket ?? browserSocket;
  let socket: SocketLike | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  // A core from another build: retrying would only fail the same way.
  let mismatch = false;

  const open = (listener: PoseSourceListener): void => {
    retry = null;
    let greeted = false;
    const current = createSocket(options.url);
    socket = current;
    current.onmessage = (event) => {
      const message = parse(event.data);
      if (!message || stopped) return;
      if (message.type === 'hello') {
        if (message.protocol !== PROTOCOL_VERSION) {
          mismatch = true;
          listener.onStatus({
            state: 'unavailable',
            message: `The core speaks protocol ${message.protocol}, this interface expects ${PROTOCOL_VERSION}. Start both from the same build.`,
          });
          current.close();
          return;
        }
        greeted = true;
        return;
      }
      if (!greeted) return;
      if (message.type === 'status') listener.onStatus(message.state === 'unavailable' ? { state: 'unavailable', message: message.message } : { state: message.state });
      else if (message.type === 'session') listener.onSession(message.session);
      else listener.onFrame(message.frame);
    };
    current.onclose = () => {
      if (stopped || mismatch || socket !== current) return;
      socket = null;
      listener.onStatus({ state: 'unavailable', message: CORE_NOT_RUNNING });
      retry = setTimeout(() => open(listener), reconnectMs);
    };
    // A failed connection is followed by `close`, which reports it.
    current.onerror = () => undefined;
  };

  return {
    kind: 'live',
    start(listener) {
      listener.onStatus({ state: 'connecting' });
      open(listener);
    },
    stop() {
      stopped = true;
      if (retry) clearTimeout(retry);
      retry = null;
      socket?.close();
      socket = null;
    },
  };
}
