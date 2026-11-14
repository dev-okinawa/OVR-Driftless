import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { startCoreServer, type CoreServer } from './coreServer.ts';
import { createFakeSteamvr, FAKE_TRACKER_ROLES } from './fakeSteamvr.ts';
import { PROTOCOL_VERSION, type CoreMessage } from './protocol.ts';

const CONFIG = { port: 0, pollHz: 30, retrySeconds: 2, scanSeconds: 2 };

/** Connects and collects messages until `until` holds or the time runs out. */
function collect(port: number, origin: string, until: (messages: CoreMessage[]) => boolean): Promise<CoreMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: CoreMessage[] = [];
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: origin } });
    const timer = setTimeout(() => {
      socket.terminate();
      resolve(messages);
    }, 2000);
    socket.on('message', (data: Buffer) => {
      messages.push(JSON.parse(String(data)) as CoreMessage);
      if (until(messages)) {
        clearTimeout(timer);
        socket.close();
        resolve(messages);
      }
    });
    socket.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe('core server on the fake SteamVR', () => {
  let server: CoreServer;
  before(async () => {
    const startedAt = performance.now();
    const now = (): number => (performance.now() - startedAt) / 1000;
    server = await startCoreServer({
      config: CONFIG,
      version: 'test',
      deps: { connect: async () => ({ ok: true, session: createFakeSteamvr(now) }), trackerRoles: async () => FAKE_TRACKER_ROLES, now },
    });
  });
  after(() => server.close());

  it('greets, reports running, describes the session and streams frames', async () => {
    const messages = await collect(server.port, 'http://localhost:5173', (list) => list.filter((m) => m.type === 'frame').length >= 3);
    assert.deepEqual(messages[0], { type: 'hello', protocol: PROTOCOL_VERSION, core: 'test' });
    assert.ok(messages.some((m) => m.type === 'status' && m.state === 'running'));

    const session = messages.find((m) => m.type === 'session');
    assert.ok(session?.type === 'session');
    const parts = session.session.devices.map((device) => device.bodyPart ?? device.role);
    assert.deepEqual(parts, ['head', 'left-hand', 'right-hand', 'waist', 'left-foot', 'right-foot', 'base-station', 'base-station']);
    assert.deepEqual(
      session.session.devices.map((device) => device.trackingSystem),
      ['headset', 'headset', 'headset', 'lighthouse', 'lighthouse', 'lighthouse', 'lighthouse', 'lighthouse'],
    );
    assert.equal(session.session.playAreas.length, 1);

    const frames = messages.filter((m) => m.type === 'frame');
    const first = frames[0];
    assert.ok(first?.type === 'frame');
    assert.equal(first.frame.devices.length, 8);
    assert.equal(first.frame.devices[0]?.state, 'tracking');
    assert.ok((first.frame.devices[0]?.pose?.position[1] ?? 0) > 1.5);
  });

  it('refuses a page from another site', async () => {
    await assert.rejects(collect(server.port, 'https://example.com', () => true));
  });
});
