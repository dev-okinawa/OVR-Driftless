// Spike: can a Node process read device poses from SteamVR?
// Calls the OpenVR C API in openvr_api.dll through koffi (FFI), no native build step.
// Read-only: connects as a background application and prints poses. Run with SteamVR already running.

import fs from 'node:fs';
import path from 'node:path';
import koffi from 'koffi';

const IVRSYSTEM_VERSION = 'IVRSystem_026'; // from openvr_capi.h; the FnTable layout below matches this version
const VR_APPLICATION_BACKGROUND = 3; // does not start SteamVR; fails when it is not running
const UNIVERSE_STANDING = 1;
const UNIVERSE_RAW = 2;
const MAX_DEVICES = 64;
const POSE_SIZE = 80; // sizeof(TrackedDevicePose_t)

const PROP_TRACKING_SYSTEM = 1000;
const PROP_MODEL = 1001;
const PROP_SERIAL = 1002;

const DEVICE_CLASS = ['invalid', 'hmd', 'controller', 'tracker', 'base station', 'display redirect'];
const TRACKING_RESULT = {
  1: 'uninitialized',
  100: 'calibrating',
  101: 'calibrating, out of range',
  200: 'ok',
  201: 'out of range',
  300: 'rotation only',
};

// Indices into VR_IVRSystem_FnTable for IVRSystem_026
const FN = {
  GetDeviceToAbsoluteTrackingPose: 12,
  GetTrackedDeviceClass: 20,
  IsTrackedDeviceConnected: 21,
  GetStringTrackedDeviceProperty: 28,
  GetRuntimeVersion: 49,
};
const FN_COUNT = 51;

function findOpenvrDll() {
  if (process.env.OPENVR_API_DLL) return process.env.OPENVR_API_DLL;
  const candidates = [];
  const vrpath = path.join(process.env.LOCALAPPDATA ?? '', 'openvr', 'openvrpaths.vrpath');
  if (fs.existsSync(vrpath)) {
    const runtimes = JSON.parse(fs.readFileSync(vrpath, 'utf8')).runtime ?? [];
    for (const runtime of runtimes) candidates.push(path.join(runtime, 'bin', 'win64', 'openvr_api.dll'));
  }
  candidates.push('C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\openvr_api.dll');
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`openvr_api.dll not found. Tried:\n  ${candidates.join('\n  ')}`);
  return found;
}

const dllPath = findOpenvrDll();
console.log(`openvr_api.dll: ${dllPath}`);
const lib = koffi.load(dllPath);

const VR_InitInternal = lib.func('intptr_t VR_InitInternal(_Out_ int *peError, int eType)');
const VR_ShutdownInternal = lib.func('void VR_ShutdownInternal()');
const VR_GetGenericInterface = lib.func('void *VR_GetGenericInterface(const char *version, _Out_ int *peError)');
const VR_GetVRInitErrorAsEnglishDescription = lib.func('const char *VR_GetVRInitErrorAsEnglishDescription(int error)');

const GetPoses = koffi.proto('void GetPoses(int origin, float predictedSeconds, _Out_ void *poses, uint32_t count)');
const GetDeviceClass = koffi.proto('int GetDeviceClass(uint32_t index)');
const IsConnected = koffi.proto('bool IsConnected(uint32_t index)');
const GetStringProp = koffi.proto('uint32_t GetStringProp(uint32_t index, int prop, _Out_ void *buffer, uint32_t size, _Out_ int *error)');
const GetRuntimeVersion = koffi.proto('const char *GetRuntimeVersion()');

const initError = [0];
VR_InitInternal(initError, VR_APPLICATION_BACKGROUND);
if (initError[0] !== 0) {
  console.error(`VR init failed (${initError[0]}): ${VR_GetVRInitErrorAsEnglishDescription(initError[0])}`);
  console.error('Start SteamVR with the headset connected, then run this again.');
  process.exit(1);
}

try {
  const interfaceError = [0];
  const table = VR_GetGenericInterface(`FnTable:${IVRSYSTEM_VERSION}`, interfaceError);
  if (interfaceError[0] !== 0 || !table) {
    throw new Error(`${IVRSYSTEM_VERSION} not available (${interfaceError[0]}): ${VR_GetVRInitErrorAsEnglishDescription(interfaceError[0])}`);
  }
  const fn = koffi.decode(table, 'void *', FN_COUNT);

  console.log(`SteamVR runtime: ${koffi.call(fn[FN.GetRuntimeVersion], GetRuntimeVersion)}`);

  const stringProp = (index, prop) => {
    const buffer = Buffer.alloc(256);
    const length = koffi.call(fn[FN.GetStringTrackedDeviceProperty], GetStringProp, index, prop, buffer, buffer.length, [0]);
    return length > 1 ? buffer.toString('utf8', 0, length - 1) : '';
  };

  const readPoses = (universe) => {
    const buffer = Buffer.alloc(MAX_DEVICES * POSE_SIZE);
    koffi.call(fn[FN.GetDeviceToAbsoluteTrackingPose], GetPoses, universe, 0, buffer, MAX_DEVICES);
    const poses = [];
    for (let index = 0; index < MAX_DEVICES; index++) {
      const base = index * POSE_SIZE;
      // HmdMatrix34_t is row-major float[3][4]; the translation is the last column
      poses.push({
        position: [buffer.readFloatLE(base + 12), buffer.readFloatLE(base + 28), buffer.readFloatLE(base + 44)],
        trackingResult: buffer.readInt32LE(base + 72),
        valid: buffer.readUInt8(base + 76) !== 0,
        connected: buffer.readUInt8(base + 77) !== 0,
      });
    }
    return poses;
  };

  const format = (position) => position.map((value) => value.toFixed(3).padStart(8)).join(' ');
  const SAMPLES = 5;

  for (let sample = 1; sample <= SAMPLES; sample++) {
    const standing = readPoses(UNIVERSE_STANDING);
    const raw = readPoses(UNIVERSE_RAW);
    console.log(`\nSample ${sample}/${SAMPLES} — position in meters: standing universe | raw universe`);
    for (let index = 0; index < MAX_DEVICES; index++) {
      if (!koffi.call(fn[FN.IsTrackedDeviceConnected], IsConnected, index)) continue;
      const deviceClass = DEVICE_CLASS[koffi.call(fn[FN.GetTrackedDeviceClass], GetDeviceClass, index)] ?? 'unknown';
      const pose = standing[index];
      const state = pose.valid ? (TRACKING_RESULT[pose.trackingResult] ?? pose.trackingResult) : 'pose invalid';
      console.log(
        `  [${String(index).padStart(2)}] ${deviceClass.padEnd(12)} ${stringProp(index, PROP_TRACKING_SYSTEM).padEnd(12)} ` +
          `${stringProp(index, PROP_MODEL).padEnd(28)} ${stringProp(index, PROP_SERIAL).padEnd(22)} ` +
          `${format(pose.position)} | ${format(raw[index].position)}  ${state}`,
      );
    }
    if (sample < SAMPLES) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  VR_ShutdownInternal();
}
