export interface CoreConfig {
  /** Port of the WebSocket server, on 127.0.0.1 only. */
  readonly port: number;
  /** Frames per second read from SteamVR and sent. */
  readonly pollHz: number;
  /** Wait between attempts to connect to SteamVR, seconds. */
  readonly retrySeconds: number;
  /** How often devices, tracker roles and the play area are read again, seconds. */
  readonly scanSeconds: number;
}

export const DEFAULT_PORT = 47115;

export function readConfig(env: NodeJS.ProcessEnv): CoreConfig {
  const port = Number(env.OVR_DRIFTLESS_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`OVR_DRIFTLESS_PORT is not a port: ${env.OVR_DRIFTLESS_PORT}`);
  return { port, pollHz: 60, retrySeconds: 2, scanSeconds: 2 };
}
