// The core: reads SteamVR and serves sessions and frames to the interface over a local WebSocket.
// Run with `npm run core` from source/, or let `npm run dev` start it. `--fake-steamvr` serves a simulated SteamVR.
import packageJson from '../package.json' with { type: 'json' };
import { readConfig } from './config.ts';
import { startCoreServer } from './coreServer.ts';
import { createFakeSteamvr, FAKE_TRACKER_ROLES } from './fakeSteamvr.ts';
import { connectOpenvr, findOpenvrDll } from './openvr.ts';
import { readOpenvrPaths } from './openvrPaths.ts';
import type { PollerDeps } from './poller.ts';
import { readTrackerRoles } from './trackerRoles.ts';

const config = readConfig(process.env);
const startedAt = performance.now();
const now = (): number => (performance.now() - startedAt) / 1000;
const fake = process.argv.includes('--fake-steamvr');

const deps: PollerDeps = fake
  ? {
      connect: async () => ({ ok: true, session: createFakeSteamvr(now) }),
      trackerRoles: async () => FAKE_TRACKER_ROLES,
      now,
    }
  : {
      connect: async () => {
        const paths = await readOpenvrPaths(process.env);
        const dll = findOpenvrDll(process.env, paths.runtime);
        if (!dll) return { ok: false, message: 'SteamVR is not installed: openvr_api.dll was not found.' };
        return connectOpenvr(dll);
      },
      trackerRoles: async () => readTrackerRoles((await readOpenvrPaths(process.env)).config),
      now,
    };

if (fake) console.log('Fake SteamVR: simulated devices, no VR hardware.');

try {
  const server = await startCoreServer({ config, deps, version: packageJson.version, log: (line) => console.log(line) });
  const shutdown = (): void => void server.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EADDRINUSE') console.error(`Port ${config.port} is taken: another core is probably running already. This one exits.`);
  else console.error(error);
  process.exit(1);
}
