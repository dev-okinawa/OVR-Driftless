import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const CORE_ENTRY = fileURLToPath(new URL('../core/src/server.ts', import.meta.url));

/**
 * Starts the core with the development server, so that opening the interface finds SteamVR's devices.
 * In `--mode fake` the core serves a simulated SteamVR, for working on the interface without VR hardware.
 */
function coreProcess(): Plugin {
  let core: ChildProcess | null = null;
  const stop = (): void => {
    core?.kill();
    core = null;
  };
  return {
    name: 'ovr-driftless-core',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITEST) return;
      stop();
      const args = server.config.mode === 'fake' ? [CORE_ENTRY, '--fake-steamvr'] : [CORE_ENTRY];
      core = spawn(process.execPath, args, { stdio: 'inherit' });
      server.httpServer?.once('close', stop);
    },
  };
}

export default defineConfig({
  plugins: [react(), coreProcess()],
  server: { port: 5173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
