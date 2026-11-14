import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { CoreConfig } from './config.ts';
import { Poller, type PollerDeps } from './poller.ts';
import { PROTOCOL_VERSION, type CoreMessage } from './protocol.ts';

export interface CoreServer {
  /** The port actually listened on; differs from the config only when it asked for port 0. */
  readonly port: number;
  close(): Promise<void>;
}

export interface CoreServerOptions {
  readonly config: CoreConfig;
  readonly deps: PollerDeps;
  /** Version of the core, sent in the hello. */
  readonly version: string;
  readonly log?: (line: string) => void;
}

/** A page from another web site must not read poses and serials; tools without a browser send no Origin. */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/** Listens on 127.0.0.1, then starts polling. Rejects when the port cannot be listened on. */
export function startCoreServer({ config, deps, version, log = () => undefined }: CoreServerOptions): Promise<CoreServer> {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: config.port,
      verifyClient: ({ origin }: { origin: string | undefined }) => originAllowed(origin),
    });

    let lastStatus: CoreMessage | null = null;
    let lastSession: CoreMessage | null = null;
    const send = (socket: WebSocket, message: CoreMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const broadcast = (message: CoreMessage): void => {
      const text = JSON.stringify(message);
      for (const socket of server.clients) if (socket.readyState === socket.OPEN) socket.send(text);
    };

    const poller = new Poller(config, deps, {
      status: (status) => {
        lastStatus = { type: 'status', ...status };
        if (status.state !== 'running') lastSession = null;
        log(`SteamVR: ${status.state}${status.state === 'unavailable' ? ` (${status.message})` : ''}`);
        broadcast(lastStatus);
      },
      session: (session) => {
        lastSession = { type: 'session', session };
        log(`Devices: ${session.devices.map((device) => `${device.name} [${device.bodyPart ?? device.role}]`).join(', ') || 'none'}`);
        broadcast(lastSession);
      },
      frame: (frame) => broadcast({ type: 'frame', frame }),
    });

    server.on('connection', (socket) => {
      send(socket, { type: 'hello', protocol: PROTOCOL_VERSION, core: version });
      if (lastStatus) send(socket, lastStatus);
      if (lastSession) send(socket, lastSession);
    });
    server.once('error', reject);
    server.once('listening', () => {
      const port = (server.address() as AddressInfo).port;
      log(`OVR Driftless core on ws://127.0.0.1:${port}`);
      poller.start();
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            poller.stop();
            for (const socket of server.clients) socket.terminate();
            server.close(() => done());
          }),
      });
    });
  });
}
