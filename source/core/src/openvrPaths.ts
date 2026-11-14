import fs from 'node:fs/promises';
import path from 'node:path';

/** Folders SteamVR registers in `%LOCALAPPDATA%\openvr\openvrpaths.vrpath`: its runtime and its settings. */
export interface OpenvrPaths {
  readonly runtime: readonly string[];
  readonly config: readonly string[];
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** Empty lists when SteamVR has never registered itself on this PC. */
export async function readOpenvrPaths(env: NodeJS.ProcessEnv): Promise<OpenvrPaths> {
  const file = path.join(env.LOCALAPPDATA ?? '', 'openvr', 'openvrpaths.vrpath');
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return { runtime: strings(record.runtime), config: strings(record.config) };
  } catch {
    return { runtime: [], config: [] };
  }
}
