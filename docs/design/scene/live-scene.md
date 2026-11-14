---
module: scene
parent: design/scene/scene.md
depends-on: []
code-anchor: source/web/src/scene
---

# Live Scene

---

## Goal

The user sees, in one desktop window, where each tracking system places every
device right now, and can judge by eye whether the two spaces agree.

---

## Preconditions

| Requirement | Detail |
|-------------|--------|
| VR runtime | SteamVR is running on the PC |
| Devices | The headset is connected; controllers, trackers and base stations are optional |

---

## User Flow

1. The user opens the application window on the PC.
2. The scene shows every connected device at its current pose.
3. The user moves the camera to look at the devices of interest.

---

## Behavior

### Scene Content

- **R1** — The window shows the headset, each controller, each tracker, each base
  station, the play-area bounds and the floor in one 3D scene.
- **R2** — Each moving device leaves a motion trail. The user can turn trails on
  and off.
- **R3** — A device that connects during the session appears without user action.
- **R4** — With only the headset and its controllers connected, the scene works
  and reports no error.

### Camera

- **R5** — The user can orbit, pan and zoom the view, and reset it.

### Runtime Availability

- **R6** — When the VR runtime is not running, the scene says so and shows no
  stale poses. It connects on its own when the runtime starts.

### Interaction with Other Features

- Device identification, tracking-system marks and the "tracking lost" and
  "disconnected" marks are shared rules of the [scene node](./scene.md).
- A trail stops while its device is marked "tracking lost" or "disconnected".

---

## Parameters

| Parameter | Value | Where it is set |
|-----------|-------|-----------------|
| Trail length | 1 s by default, 1 to 60 s | By the user, in Settings |
| Trail fade | Fades from the device toward the oldest point | Fixed |
| Time without tracking before a device is marked "tracking lost" | — | — |

---

## States and Feedback

| State | What the user sees |
|-------|--------------------|
| Runtime not running | A message that the VR runtime is unavailable; no devices |
| Live | Devices at their current poses |
| Device tracking lost | The device at its last known pose with the "tracking lost" mark; its trail stopped |
| Device disconnected | The device with the "disconnected" mark |

---

## Acceptance Criteria

Verifiable in a live session with the hardware named in Preconditions:

- **AC1** — With SteamVR running, the window shows the headset, both controllers,
  every powered tracker, every base station, the bounds and the floor. Moving a
  device by hand moves its drawing.
- **AC2** — Devices tracked by the headset and devices tracked by Lighthouse can
  be told apart in a greyscale screenshot.
- **AC3** — Covering a tracker so that it loses tracking marks it "tracking lost"
  and stops its trail. Uncovering it resumes the drawing without a restart.
- **AC4** — A controller taken out of the headset's view and a controller that is
  switched off look different in the scene.
- **AC5** — A tracker powered on during the session appears without user action.
- **AC6** — Closing SteamVR with the scene open shows the unavailable message.
  Starting SteamVR reconnects the scene.
- **AC7** — With only the headset connected, the scene shows the headset and
  reports no error.

---

## Related Documents

- [Scene](./scene.md) — shared rules and open items
- [Live scene specification](../../specification/scene/live-scene.md) — the core,
  its protocol and the live source
