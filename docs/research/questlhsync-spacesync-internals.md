# QuestLHSync and OpenVR-SpaceSync Internals

How two recent tools align the Lighthouse space with a headset's space without a
manual recalibration, and whether they fit the first supported configuration.
OpenVR-SpaceSync is the only existing tool found that works with no root and no
tracker on the headset.

Sources, read but not built and not run; paths are relative to each repository
root:

- QuestLHSync — `github.com/CreoleVR/QuestLHSync`, commit `b0c251d`
  ("QuestLHSync 1.28", 2026-11-01).
- OpenVR-SpaceSync — `github.com/shinyflvre/OpenVR-SpaceSync`, commit `90866be`
  (2026-10-05).

## Evidence Levels

| Level | Meaning |
|---|---|
| **Verified** | Read in the source at the commit above; the file reference is given |
| **Stated by project** | The project's README, release notes or UI text |
| **Reported** | Issues, forum posts and other third-party sources |
| **Hypothesis** | Inferred; needs a run to confirm |

## QuestLHSync

### Mechanism

- **Verified** — It solves four unknowns, a rotation about the vertical axis and
  a translation, and treats both spaces as aligned to gravity
  (`src/driver/sync.h:1-2,10`).
- **Verified** — It uses the monochrome tracking cameras, not the color
  passthrough cameras; rolling-shutter cameras are rejected
  (`magisk/src/quest.c:126`, `src/driver/sync.cpp:125`).
- **Verified** — It uses no Android camera API. A root daemon injects a Frida
  script into the tracking service process
  `vendor.oculus.hardware.sensors@1.0-service` and reads the camera buffers in
  that process's memory (`magisk/src/quest.c:20,258-284`,
  `magisk/src/lhsight.js:41-87`). Camera calibration is read from
  `/persist/calibration` (`quest.c:37-56`).
- **Verified** — Only short-exposure frames are used; saturated spots are
  detected and only their centroid, size and peak leave the headset
  (`magisk/src/lhsight.c:122-126,193-270`).
- **Verified** — A base station's identity is not decoded from its light. Each
  ray is assigned to the base station nearest in angle under the current
  hypothesis; base station poses come from SteamVR
  (`sync.cpp:1056-1069`, `src/driver/driver_main.cpp:169-183`).
- **Verified** — The solve runs on the PC: a minimal two-ray solver with
  consensus for acquisition, then a robust fit of the ray bundle
  (`sync.cpp:1171-1366,1441-1503`).
- **Verified** — Sightings are dropped while the head is still and while it turns
  faster than 60°/s (`sync.cpp:3176,3195`, `sync.h:40`). Without head motion the
  correction does not update.
- **Verified** — The correction is applied through a MinHook hook on
  `TrackedDevicePoseUpdated`, to devices whose tracking system is `lighthouse`
  (`driver_main.cpp:167,208-214,381-388`). It is slewed at 5 mm/s while the head
  is still, faster while it moves; a difference above 25 cm is applied at once
  (`sync.h:87-91`, `sync.cpp:3694-3716`).
- **Verified** — A break in the headset pose stream, a jump or a pause over one
  second, discards old sightings and starts a new acquisition
  (`sync.cpp:428-460,3483-3492`).

### Requirements and Maturity

- **Hypothesis** — Root is required because the method needs code injection into
  a vendor process, access to its memory, and `/persist`; none is available to an
  ordinary application.
- **Stated by project** — Base stations 1.0 and 2.0, Quest Pro, 3 and 3S are
  listed as supported (`README.md:25-29`). The module installer says Quest 3 / 3S
  were "not tried yet" (`magisk/module/customize.sh:5-6`); the infrared optics
  correction was measured on Quest Pro and assumed for Quest 3 (`sync.h:32-34`).
- **Reported** — The only root path found for Quest 3 / 3S is an exploit for
  firmware up to v79, temporary, closed in later versions.
- **Reported** — Open issues include: a Quest Pro OS update changed the camera
  frame rhythm and broke acquisition; a fixed 5 cm offset with 1.0 base stations;
  an offset after a 180° turn; lost controller button presses through ALVR.
- **Verified** — The root daemon listens on all network interfaces without
  authentication. Any host on the network receives the device serial number,
  model, firmware and camera calibration, and by connecting starts the injection
  into the tracking service (`src/headset/lhsyncd.c:128-141,232-253,289-311`).
- **Verified** — MIT license (`LICENSE`).

### Fit

- The PC side fits the first supported configuration unchanged.
- The headset side does not: it needs root, is unconfirmed on Quest 3 / 3S, and
  depends on the internals of a specific OS build.
- The solver and the driver are MIT and usable as a base if another source of
  sightings exists.

## Passthrough Camera API

- **Stated by project** — The API gives the front color cameras only, at 60 Hz,
  on Horizon OS v74 and later. The tracking cameras are not exposed.
- **Reported** — One forum answer says the Quest 3 color cameras see visible
  light only.
- **Hypothesis** — The camera method cannot be reproduced without root: the color
  cameras have a rolling shutter, no short-exposure frames and look forward, even
  if they pass some infrared.

## OpenVR-SpaceSync

### What It Is

- **Stated by project** — A fork of OpenVR-SpaceOverride, itself descended from
  Space Calibrator: a SteamVR driver and an overlay (`README.md:6-13`). Marked
  beta; releases from 1.0.1 (2026-08-24) to 2.5.0 (2026-10-01).
- **Verified** — It hooks the same `TrackedDevicePoseUpdated` call
  (`src/driver/InterfaceHookInjector.cpp:13-65`), hence the conflict with
  QuestLHSync and Space Calibrator.

### Modes

- **Stated by project** — Main mode: a Lighthouse tracker fixed on the headset;
  the offset between the spaces is computed in closed form on every frame, with
  latency compensation and jump handling (`README.md:11,21,33-41`).
- **Verified** — Mode "HMD Driven + No Tracker": a one-time calibration with a
  Lighthouse device held against the head, no permanent tracker, described in the
  UI as "Drifts over time" (`src/overlay/Localization.cpp:176-181`,
  `src/driver/ServerTrackedDeviceProvider.cpp:223-254`).
- **Verified** — Headset recenters and jumps are detected from the pose stream
  and carried into the alignment (`ServerTrackedDeviceProvider.cpp:655-661`).
- **Verified** — "Stay Aligned": an option for the no-tracker mode, off by
  default. It needs a Vive or Tundra tracker with the SteamVR role "Waist" and
  works on yaw-plus-translation frames with a step detector. The UI text says it
  reduces drift and does not eliminate it (`Localization.cpp:203-207`,
  `include/driver/StayAligned.h:13-70`).

### Requirements and Fit

- **Stated by project** — No root, PC only. Virtual Desktop, Steam Link, ALVR and
  PICO Connect are listed; the author tested Galaxy XR with Virtual Desktop
  (`README.md:15,67`). Quest 3 / 3S is not in the tested list.
- **Verified** — AGPL-3.0 (`LICENSE`, `include/driver/StayAligned.h:1`). Its code
  cannot be taken into a product under a different license.
- **Hypothesis** — It fits the first supported configuration: no tracker on the
  headset, a waist tracker is worn. The remaining drift in this configuration is
  not measured.
