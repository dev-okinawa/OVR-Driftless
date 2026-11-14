import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseTrackerRoles, readTrackerRoles, trackerRoleOf } from './trackerRoles.ts';

const SETTINGS = {
  steamvr: { requireHmd: false },
  trackers: {
    '/devices/htc/vive_trackerLHR-1A2B3C4D': 'TrackerRole_Waist',
    '/devices/htc/vive_trackerLHR-5E6F7A8B': 'TrackerRole_LeftFoot',
    '/devices/broken': 7,
  },
};

describe('tracker roles', () => {
  it('reads roles by device path and skips values that are not names', () => {
    const roles = parseTrackerRoles(SETTINGS);
    assert.equal(trackerRoleOf(roles, 'htc/vive_trackerLHR-1A2B3C4D'), 'TrackerRole_Waist');
    assert.equal(trackerRoleOf(roles, 'htc/vive_trackerLHR-5E6F7A8B'), 'TrackerRole_LeftFoot');
    assert.equal(roles.has('/devices/broken'), false);
    assert.equal(trackerRoleOf(roles, ''), undefined);
  });

  it('has no roles without a trackers section', () => {
    assert.equal(parseTrackerRoles({ steamvr: {} }).size, 0);
    assert.equal(parseTrackerRoles(null).size, 0);
  });

  it('reads the first settings folder that has the file', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'ovr-roles-'));
    const full = await fs.mkdtemp(path.join(os.tmpdir(), 'ovr-roles-'));
    await fs.writeFile(path.join(full, 'steamvr.vrsettings'), JSON.stringify(SETTINGS));
    const roles = await readTrackerRoles([empty, full]);
    assert.equal(roles.size, 2);
    await fs.rm(empty, { recursive: true });
    await fs.rm(full, { recursive: true });
  });
});
