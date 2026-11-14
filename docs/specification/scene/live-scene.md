---
design: design/scene/live-scene.md
module: scene
parent: specification/scene/scene.md
depends-on: []
---

# Live Scene

**Design:** [design/scene/live-scene](../../design/scene/live-scene.md)

---

## Overview

The core (`source/core/`) is a background Node process. It connects to SteamVR as
a background application, finds the devices, reads their poses at a fixed rate
and serves sessions and frames over a local WebSocket. The interface's live
source (`source/web/src/sources/live/`) connects to it and feeds the session
store like the simulator does. The live source is the default: opening the
interface starts it. The development server starts the core with itself.

Both sides retry on their own: the core retries SteamVR, the live source retries
the core. Until data arrives the interface says why there is none and shows no
pose.

## Code Map

| Type | Path | Role |
|------|------|------|
| Entry point | `source/core/src/server.ts` | Reads the config, picks SteamVR or, with `--fake-steamvr`, the fake one, starts the server |
| Server | `source/core/src/coreServer.ts` | WebSocket server; sends every client the hello, the latest status and session, then each frame |
| Test stand-in | `source/core/src/fakeSteamvr.ts` | A simulated SteamVR in place of the OpenVR adapter, see Fake SteamVR below |
| Application logic | `source/core/src/poller.ts` | Connects to SteamVR and retries, scans devices, reads poses at the poll rate, builds sessions and frames |
| Adapter | `source/core/src/openvr.ts` | The only code that calls `openvr_api.dll` (koffi): init, shutdown, events, device properties, poses, play area |
| Math | `source/core/src/convert.ts` | Pure conversions from OpenVR values to project types: matrix to pose, class to role, tracking system, state, body part |
| Adapter | `source/core/src/trackerRoles.ts` | Reads the tracker roles the user set in SteamVR from `steamvr.vrsettings` |
| Protocol | `source/core/src/protocol.ts` | Message types and `PROTOCOL_VERSION`; the interface imports them |
| Config | `source/core/src/config.ts` | Port, poll rate, retry and scan intervals |
| Source | `source/web/src/sources/live/liveSource.ts` | `PoseSource` of kind `live`: WebSocket client, version check, reconnect |
| Dev launch | `source/web/vite.config.ts` | Starts the core when the development server starts and stops it when it stops |

The core is TypeScript run directly by Node 24 (type stripping), so it has no
build step; it uses erasable syntax only.

## Data Model

The protocol carries the project's own types (`docs/specification/scene/scene.md`,
Data Model). The core builds them as follows.

| Field | Source in OpenVR | Rule |
|-------|------------------|------|
| `DeviceInfo.id` | `Prop_SerialNumber_String` | The serial; `index-N` when the device has none |
| `DeviceInfo.role` | `GetTrackedDeviceClass` | HMD `headset`, controller `controller`, generic tracker `tracker`, tracking reference `base-station`; other classes are left out |
| `DeviceInfo.trackingSystem` | `Prop_TrackingSystemName_String`, class | `lighthouse` when the name is `lighthouse` and the device is not the HMD; `headset` otherwise |
| `DeviceInfo.name` | `Prop_ModelNumber_String` | |
| `DeviceInfo.bodyPart` | class, `Prop_ControllerRoleHint_Int32`, tracker roles | HMD `head`; controller role 1 `left-hand`, 2 `right-hand`; a tracker by its SteamVR role: `TrackerRole_Waist` `waist`, `TrackerRole_Chest` `chest`, `TrackerRole_LeftFoot` `left-foot`, `TrackerRole_RightFoot` `right-foot`; absent otherwise |
| `DeviceSample.state` | `bDeviceIsConnected`, `bPoseIsValid`, `eTrackingResult` | Not connected `disconnected`; connected, valid and `Running_OK` (200) `tracking`; otherwise `tracking-lost` |
| `DeviceSample.pose` | `mDeviceToAbsoluteTracking`, standing universe | The 3×4 row-major matrix as position and unit quaternion; the last valid pose while not tracking; null if never tracked |
| `PlayArea` | `IVRChaperone::GetPlayAreaRect` | The four corners, in the tracking system of the HMD; none while the chaperone is not calibrated |
| `SessionInfo.floorHeight` | — | 0: the standing universe puts the floor at y = 0 |
| `Frame.time` | — | Seconds since the core started |

A device joins the session the first time its pose reports it connected, so
devices SteamVR only remembers stay out of the scene: ones switched off since an
earlier run, and the headset's hand-tracking hands (Virtual Desktop registers
them as controllers `HANDL` and `HANDR`) while the controllers are held. Once in,
a device stays, marked `disconnected` when it goes; the session is rebuilt when
SteamVR reconnects. SteamVR's coordinates are the
project's (right-handed, +Y up, -Z forward, meters), so no axis changes.

## Contracts

### Core WebSocket

`ws://127.0.0.1:{port}`. One JSON object per text message; the client sends
nothing.

| Message | Payload | When |
|---------|---------|------|
| `hello` | `protocol: number`, `core: string` (core version) | First, on every connection |
| `status` | `state: 'connecting' \| 'running' \| 'unavailable'`, `message?: string` | On connection, then on every change |
| `session` | `session: SessionInfo` | On connection when there is one, then whenever a device joins, a role or name changes, or the play area changes |
| `frame` | `frame: Frame` | At the poll rate while SteamVR is connected; matches the latest session |

| Core status | Meaning | `message` |
|-------------|---------|-----------|
| `connecting` | Started, SteamVR not tried yet | — |
| `running` | SteamVR connected, frames flow | — |
| `unavailable` | SteamVR not running, SteamVR running without a headset (`Init_HmdNotFound`), another init error, `openvr_api.dll` not found, or `IVRSystem_026` not offered | Says which, in words for the user |

The protocol version is `PROTOCOL_VERSION` in `protocol.ts`, now 1. Any change
to a message increments it.

### Live Source

| Situation | Status reported to the store |
|-----------|------------------------------|
| Started, socket not open yet | `connecting` |
| Core not reachable | `unavailable`, "The OVR Driftless core is not running. Start the application with npm run dev." Retries every `reconnectSeconds` |
| `hello` with another protocol | `unavailable`, naming both versions; the socket is closed and not retried |
| Core `status` | Passed on |
| Socket closed | `unavailable` as for an unreachable core; retries |

`session` and `frame` messages go to the listener unchanged. `stop()` closes the
socket and cancels the retry.

### Session Store

A status of `connecting` or `unavailable` clears the session and the latest frame,
so that no stale pose is drawn, measured or recorded.

### Core Launch

`npm run dev` starts the development server, which starts the core as a child
process and stops it when it stops (not under Vitest). `npm run core` runs the
core alone. A second core on the same port fails to listen, says so and exits;
the first one keeps serving.

### Fake SteamVR

`npm run dev:fake` (the development server in Vite mode `fake`) and
`npm run core:fake` start the core with `--fake-steamvr`. The fake replaces only
`openvr.ts`; polling, conversion, the protocol, the WebSocket and the live source
are the real ones, so the interface is worked on and tested end to end without VR
hardware.

| Device | Body part (role from the fake tracker roles) | Tracking system |
|--------|-----------------------------------------------|-----------------|
| Fake Headset | head | headset |
| Two Fake Controllers | left-hand, right-hand | headset |
| Three VIVE Trackers | waist, left-foot, right-foot | lighthouse |
| Two base stations | — | lighthouse |

The person sways and turns near the middle of a 3 × 3 m play area and moves the
arms and feet. Faults on a fixed schedule: the left foot tracker loses tracking
from 15 to 17 s of every 20 s, and the right controller switches off from 24 to
27 s of every 30 s. The two spaces are aligned; the simulator source covers
misalignment and drift.

## UI

| Component | Change |
|-----------|--------|
| `app/App.tsx` | The chosen source is `live` on launch; Settings switches between `live` and `simulated`; closing a replay returns to the chosen source |
| `app/SettingsPanel.tsx` | The SteamVR option is enabled; the replay button names the source it returns to |
| `app/StatusChip.tsx` | `CONNECTING`, `LIVE`, or `NO SIGNAL` whose description is the status message (why SteamVR or the core is unavailable) |
| `app/ScenePlates.tsx` | With the live source an unavailable status puts no plate over the scene: it is an ordinary wait, and the status chip says why; connecting and no devices still show their plates |

The calibration's simulated pair gesture exists only on the simulator; with the
live source the user joins the pair by hand.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `OVR_DRIFTLESS_PORT` (core, environment) | number | 47115 | Port the core listens on, on 127.0.0.1 only |
| `pollHz` (`config.ts`) | number | 60 | Frames per second read from SteamVR and sent |
| `retrySeconds` (`config.ts`) | number | 2 | Wait between attempts to connect to SteamVR |
| `scanSeconds` (`config.ts`) | number | 2 | How often devices, tracker roles and the play area are read again |
| `VITE_CORE_URL` (interface, build environment) | string | `ws://127.0.0.1:47115` | Where the live source connects |
| `reconnectSeconds` (`liveSource.ts`) | number | 2 | Wait between attempts to reach the core |
| `OPENVR_API_DLL` (core, environment) | path | found through `openvrpaths.vrpath` | Overrides where `openvr_api.dll` is loaded from |

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| SteamVR, `openvr_api.dll` | Runtime | `IVRSystem_026`, `IVRChaperone_004`; the DLL shipped with SteamVR, located through `%LOCALAPPDATA%\openvr\openvrpaths.vrpath` |
| `koffi` | Library | FFI to the OpenVR C API ([ADR 0001](../../architecture/decisions/0001-web-interface-node-core.md)) |
| `ws` | Library | WebSocket server in the core |
| Node 24 | Runtime | Runs the core's TypeScript without a build |

## Edge Cases

- SteamVR not running at start: `unavailable`, retried every `retrySeconds`; the
  interface connects on its own when it starts (design R6).
- SteamVR quits during the session: the core sees `VREvent_Quit`, shuts OpenVR
  down, reports `unavailable` and retries.
- The core is closed or crashes: the live source reports `unavailable` and
  retries.
- Only the headset: a session with one device and no error (design R4).
- A device connects during the session: it joins on the first frame that reports
  it connected, after the scan that found it, so within `scanSeconds` (design R3).
- Hand tracking and controllers both claim a hand: both devices carry the body
  part; the skeleton follows the one that is tracking, the first in the frame
  when both are.
- A tracker without a SteamVR role has no body part; the skeleton does not use it.
- Two trackers with the same role: both carry the body part; the skeleton uses
  the first one in the frame.

## Security and Privacy

The core listens on 127.0.0.1 only and accepts a WebSocket only from a page whose
`Origin` is `http://localhost` or `http://127.0.0.1` on any port, or none (a
non-browser client), so another web site open in the browser cannot read poses
and serials. The core accepts no commands.

## Compatibility

- `IVRSystem_026` and its function table order are fixed in `openvr.ts`; a SteamVR
  that does not offer that version is reported as `unavailable`.
- The protocol version is checked on every connection; an interface and a core
  from different builds fail as described above.
- `steamvr.vrsettings` is read, never written.

## Verification

Automated tests:

| Test | Path | What it proves |
|------|------|----------------|
| Conversions | `source/core/src/convert.test.ts` | Matrix to pose, roles, tracking system, state and body part rules of the Data Model |
| Tracker roles | `source/core/src/trackerRoles.test.ts` | Roles are read from a settings document by device path |
| Core end to end | `source/core/src/coreServer.test.ts` | On the fake SteamVR a WebSocket client gets the hello, `running`, the session with body parts and tracking systems, and frames; a foreign Origin is refused |
| Fake SteamVR | `source/core/src/fakeSteamvr.test.ts` | Devices track, and the scheduled faults give `tracking-lost` and `disconnected` |
| Live source | `source/web/src/sources/live/liveSource.test.ts` | Status, version mismatch, message pass-through, reconnect, stop |
| Session store | `source/web/src/state/sessionStore.test.ts` | Unavailable and connecting clear the session and frame |

Manual scenarios in a live session follow the design's acceptance criteria
AC1 to AC7:

| Scenario | Hardware | Steps | Expected |
|----------|----------|-------|----------|
| Start with SteamVR | Headset through its streaming software, controllers, trackers with roles, base stations | Start SteamVR; run `npm run dev`; open the interface | `LIVE` in the status chip; every device at its pose; trackers with roles carry their body part (the skeleton follows them) |
| Start without SteamVR | Same | Run `npm run dev` with SteamVR closed; then start SteamVR | "SteamVR is not running" with no devices; the devices appear within `retrySeconds` of SteamVR starting |
| SteamVR closes | Same | Close SteamVR with the interface open | The unavailable message, no stale poses, the core keeps running |
| Device joins | A tracker switched off | Switch it on | It appears without user action |

## Implementation Notes

- `VREvent_t` is 64 bytes on Windows x64 (12-byte header, 8-byte aligned union of
  48 bytes); `PollNextEvent` is called with that size.
- Tracker roles live in the `trackers` object of `steamvr.vrsettings`, keyed by
  `/devices/` + `Prop_RegisteredDeviceType_String` (for example
  `/devices/htc/vive_trackerLHR-1A2B3C4D`). The file is in the `config` folder
  named by `openvrpaths.vrpath`. This is how other tools read roles (Reported);
  confirm on hardware.
- The core's wire types are its own, structurally the same as the interface's
  domain types; the interface imports only `protocol.ts`. Moving the shared types
  into one package is the open follow-up of ADR 0001.
- `probe.mjs` stays as a diagnostic that prints what the core would see.

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | Does a Quest through Virtual Desktop or ALVR report its controllers as `tracking` with `Running_OK` while they are out of the cameras' view? | Decides whether AC4 can tell "out of view" from "switched off" | Treat anything but `Running_OK` as `tracking-lost`; measure on hardware | — |
| Q2 | Is the chaperone play area the headset's bounds when the headset streams through Virtual Desktop or ALVR? | Decides which bounds R1 shows | Show it as the headset's area | — |
