// The only code that calls the OpenVR C API in openvr_api.dll (through koffi). Function table indices and
// struct layouts follow openvr_capi.h for IVRSystem_026 and IVRChaperone_004.
import fs from 'node:fs';
import path from 'node:path';
import koffi from 'koffi';
import type { Vec3 } from './protocol.ts';

const IVRSYSTEM_VERSION = 'IVRSystem_026';
const IVRCHAPERONE_VERSION = 'IVRChaperone_004';
/** `EVRApplicationType::VRApplication_Background`: does not start SteamVR, fails when it is not running. */
const VR_APPLICATION_BACKGROUND = 3;
/** `EVRInitError` values worth saying in plain words. */
const INIT_NO_SERVER = 121;
const INIT_HMD_NOT_FOUND = 108;
const UNIVERSE_STANDING = 1;
export const MAX_DEVICES = 64;
/** sizeof(TrackedDevicePose_t): HmdMatrix34_t, two HmdVector3_t, ETrackingResult, two bools, padding. */
const POSE_SIZE = 80;
/** sizeof(VREvent_t) on Windows x64: a 12-byte header and an 8-byte aligned union of 48 bytes. */
const EVENT_SIZE = 64;
/** `EVREventType::VREvent_Quit`. */
const EVENT_QUIT = 700;

const PROP = {
  trackingSystemName: 1000,
  modelNumber: 1001,
  serialNumber: 1002,
  registeredDeviceType: 1036,
  controllerRoleHint: 3007,
} as const;

const SYSTEM_FN = {
  getDeviceToAbsoluteTrackingPose: 12,
  getTrackedDeviceClass: 20,
  getInt32TrackedDeviceProperty: 24,
  getStringTrackedDeviceProperty: 28,
  pollNextEvent: 30,
  count: 51,
} as const;
const CHAPERONE_FN = { getPlayAreaRect: 2, count: 9 } as const;

/** What OpenVR says about one device index, before conversion. */
export interface RawDevice {
  readonly index: number;
  /** `ETrackedDeviceClass`. */
  readonly deviceClass: number;
  readonly trackingSystemName: string;
  readonly model: string;
  readonly serial: string;
  readonly registeredDeviceType: string;
  readonly controllerRoleHint: number;
}

/** One device's entry of `GetDeviceToAbsoluteTrackingPose`, standing universe. */
export interface RawPose {
  /** `HmdMatrix34_t`, row-major 3×4, meters. */
  readonly matrix: readonly number[];
  readonly trackingResult: number;
  readonly valid: boolean;
  readonly connected: boolean;
}

export interface OpenvrSession {
  /** Every index SteamVR has a device class for, connected or not. */
  devices(): RawDevice[];
  /** One entry per index, `MAX_DEVICES` long. */
  poses(): RawPose[];
  /** Drains the event queue; true when SteamVR asked applications to quit. */
  quitRequested(): boolean;
  /** Corners of the calibrated play area, or null when there is none. */
  playArea(): Vec3[] | null;
  shutdown(): void;
}

export type ConnectResult = { readonly ok: true; readonly session: OpenvrSession } | { readonly ok: false; readonly message: string };

/** `OPENVR_API_DLL`, then each runtime SteamVR registered, then the default Steam folder; null when none exists. */
export function findOpenvrDll(env: NodeJS.ProcessEnv, runtimeFolders: readonly string[]): string | null {
  if (env.OPENVR_API_DLL) return env.OPENVR_API_DLL;
  const candidates = [
    ...runtimeFolders.map((folder) => path.join(folder, 'bin', 'win64', 'openvr_api.dll')),
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\bin\\win64\\openvr_api.dll',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

interface Library {
  readonly init: (error: number[], type: number) => unknown;
  readonly shutdown: () => void;
  readonly getInterface: (version: string, error: number[]) => unknown;
  readonly describeError: (error: number) => string;
}

const libraries = new Map<string, Library>();

function load(dllPath: string): Library {
  const cached = libraries.get(dllPath);
  if (cached) return cached;
  const lib = koffi.load(dllPath);
  const library: Library = {
    init: lib.func('intptr_t VR_InitInternal(_Out_ int *peError, int eType)'),
    shutdown: lib.func('void VR_ShutdownInternal()'),
    getInterface: lib.func('void *VR_GetGenericInterface(const char *version, _Out_ int *peError)'),
    describeError: lib.func('const char *VR_GetVRInitErrorAsEnglishDescription(int error)'),
  };
  libraries.set(dllPath, library);
  return library;
}

const GetPoses = koffi.proto('void GetPoses(int origin, float predictedSeconds, _Out_ void *poses, uint32_t count)');
const GetDeviceClass = koffi.proto('int GetDeviceClass(uint32_t index)');
const GetInt32Prop = koffi.proto('int32_t GetInt32Prop(uint32_t index, int prop, _Out_ int *error)');
const GetStringProp = koffi.proto('uint32_t GetStringProp(uint32_t index, int prop, _Out_ void *buffer, uint32_t size, _Out_ int *error)');
const PollNextEvent = koffi.proto('bool PollNextEvent(_Out_ void *event, uint32_t size)');
const GetPlayAreaRect = koffi.proto('bool GetPlayAreaRect(_Out_ void *rect)');

/** Connects to a running SteamVR as a background application. */
export function connectOpenvr(dllPath: string): ConnectResult {
  let library: Library;
  try {
    library = load(dllPath);
  } catch (error) {
    return { ok: false, message: `openvr_api.dll could not be loaded from ${dllPath}: ${String(error)}` };
  }

  const initError = [0];
  library.init(initError, VR_APPLICATION_BACKGROUND);
  const code = initError[0] ?? 0;
  if (code === INIT_NO_SERVER) return { ok: false, message: 'SteamVR is not running.' };
  if (code === INIT_HMD_NOT_FOUND) return { ok: false, message: 'SteamVR is running, but no headset is connected.' };
  // The description already ends with the code, for example "Hmd Not Found (108)".
  if (code !== 0) return { ok: false, message: `SteamVR refused the connection: ${library.describeError(code)}.` };

  const table = (version: string, count: number): unknown[] | null => {
    const error = [0];
    const pointer = library.getInterface(`FnTable:${version}`, error);
    return error[0] === 0 && pointer ? (koffi.decode(pointer, 'void *', count) as unknown[]) : null;
  };
  const system = table(IVRSYSTEM_VERSION, SYSTEM_FN.count);
  if (!system) {
    library.shutdown();
    return { ok: false, message: `This SteamVR does not offer ${IVRSYSTEM_VERSION}; update SteamVR.` };
  }
  const chaperone = table(IVRCHAPERONE_VERSION, CHAPERONE_FN.count);
  const fn = (functions: unknown[], index: number): unknown => functions[index];

  const poseBuffer = Buffer.alloc(MAX_DEVICES * POSE_SIZE);
  const eventBuffer = Buffer.alloc(EVENT_SIZE);
  const stringBuffer = Buffer.alloc(256);
  const quadBuffer = Buffer.alloc(4 * 3 * 4);
  const propError = [0];

  const stringProp = (index: number, prop: number): string => {
    const length = koffi.call(fn(system, SYSTEM_FN.getStringTrackedDeviceProperty), GetStringProp, index, prop, stringBuffer, stringBuffer.length, propError) as number;
    return length > 1 ? stringBuffer.toString('utf8', 0, length - 1) : '';
  };
  const int32Prop = (index: number, prop: number): number =>
    koffi.call(fn(system, SYSTEM_FN.getInt32TrackedDeviceProperty), GetInt32Prop, index, prop, propError) as number;

  let open = true;
  return {
    ok: true,
    session: {
      devices() {
        const devices: RawDevice[] = [];
        for (let index = 0; index < MAX_DEVICES; index += 1) {
          const deviceClass = koffi.call(fn(system, SYSTEM_FN.getTrackedDeviceClass), GetDeviceClass, index) as number;
          if (deviceClass === 0) continue;
          devices.push({
            index,
            deviceClass,
            trackingSystemName: stringProp(index, PROP.trackingSystemName),
            model: stringProp(index, PROP.modelNumber),
            serial: stringProp(index, PROP.serialNumber),
            registeredDeviceType: stringProp(index, PROP.registeredDeviceType),
            controllerRoleHint: int32Prop(index, PROP.controllerRoleHint),
          });
        }
        return devices;
      },

      poses() {
        koffi.call(fn(system, SYSTEM_FN.getDeviceToAbsoluteTrackingPose), GetPoses, UNIVERSE_STANDING, 0, poseBuffer, MAX_DEVICES);
        const poses: RawPose[] = [];
        for (let index = 0; index < MAX_DEVICES; index += 1) {
          const base = index * POSE_SIZE;
          const matrix: number[] = [];
          for (let i = 0; i < 12; i += 1) matrix.push(poseBuffer.readFloatLE(base + i * 4));
          poses.push({
            matrix,
            trackingResult: poseBuffer.readInt32LE(base + 72),
            valid: poseBuffer.readUInt8(base + 76) !== 0,
            connected: poseBuffer.readUInt8(base + 77) !== 0,
          });
        }
        return poses;
      },

      quitRequested() {
        let quit = false;
        while (koffi.call(fn(system, SYSTEM_FN.pollNextEvent), PollNextEvent, eventBuffer, EVENT_SIZE)) {
          if (eventBuffer.readUInt32LE(0) === EVENT_QUIT) quit = true;
        }
        return quit;
      },

      playArea() {
        if (!chaperone) return null;
        if (!koffi.call(fn(chaperone, CHAPERONE_FN.getPlayAreaRect), GetPlayAreaRect, quadBuffer)) return null;
        const corners: Vec3[] = [];
        for (let i = 0; i < 4; i += 1) corners.push([quadBuffer.readFloatLE(i * 12), quadBuffer.readFloatLE(i * 12 + 4), quadBuffer.readFloatLE(i * 12 + 8)]);
        return corners;
      },

      shutdown() {
        if (!open) return;
        open = false;
        library.shutdown();
      },
    },
  };
}
