import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Tracker roles the user set in SteamVR ("Manage Trackers"), by device path (`/devices/` + the device's
 * `Prop_RegisteredDeviceType_String`), as stored in the `trackers` object of `steamvr.vrsettings`.
 */
export type TrackerRoles = ReadonlyMap<string, string>;

export function parseTrackerRoles(settings: unknown): TrackerRoles {
  const roles = new Map<string, string>();
  if (typeof settings !== 'object' || settings === null) return roles;
  const trackers = (settings as Record<string, unknown>).trackers;
  if (typeof trackers !== 'object' || trackers === null) return roles;
  for (const [devicePath, role] of Object.entries(trackers)) if (typeof role === 'string') roles.set(devicePath, role);
  return roles;
}

/** Reads the roles from the first settings folder that has the file; no roles when none has it or it does not parse. */
export async function readTrackerRoles(configFolders: readonly string[]): Promise<TrackerRoles> {
  for (const folder of configFolders) {
    try {
      return parseTrackerRoles(JSON.parse(await fs.readFile(path.join(folder, 'steamvr.vrsettings'), 'utf8')));
    } catch {
      // Missing or unreadable here: try the next folder.
    }
  }
  return new Map();
}

export function trackerRoleOf(roles: TrackerRoles, registeredDeviceType: string): string | undefined {
  return registeredDeviceType ? roles.get(`/devices/${registeredDeviceType}`) : undefined;
}
