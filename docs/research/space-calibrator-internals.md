# Space Calibrator Internals

How the maintained fork of OpenVR Space Calibrator works inside: how it changes
device poses, how it calibrates, and what it does when a tracking origin moves.
It is the closest existing code to this product and is MIT-licensed.

Source: [hyblocker/OpenVR-SpaceCalibrator][repo], branch `develop`, commit
`797e464` (2026-10-25), version `v2.0.2-BETA`. This is the 2.0 rewrite, not the
1.x code. The code was read, not built and not run. Paths are relative to the
repository root.

## Evidence Levels

| Level | Meaning |
|---|---|
| **Verified** | Read in the source at the commit above; the file reference is given |
| **Reported** | Read through a web summary of another repository, not first-hand |
| **Hypothesis** | Inferred from the code; needs a run to confirm |

## Pose Modification

- **Verified** — The driver hooks `IVRDriverContext::GetGenericInterface`, and
  when `IVRServerDriverHost_005` or `_006` is requested it hooks
  `TrackedDevicePoseUpdated` in that interface
  (`src/driver/interface_hook_injector.cpp:46-63`). On Windows the hook is made
  with MinHook (`src/driver/hooking.h:54-72`).
- **Verified** — Every pose update passes through the hook before the runtime
  receives it. The untouched pose is first copied out for the application
  (`src/driver/tracked_device_provider.cpp:238`), then the pose is modified in
  place.
- **Verified** — The correction is applied through the driver-to-world transform
  of the pose, not by rewriting the device position:
  `qWorldFromDriverRotation = R * qWorldFromDriverRotation` and
  `vecWorldFromDriverTranslation = R * vecWorldFromDriverTranslation + p`
  (`src/driver/tracked_device_provider.cpp:327-339`).
- **Verified** — The driver knows nothing about tracking systems. It applies a
  table of 64 per-device transforms (`tracked_device_provider.cpp:243`). The
  application fills the table for every device whose
  `Prop_TrackingSystemName_String` equals that of the target device
  (`src/overlay/calibration.cpp:1316-1322`).
- **Hypothesis** — An application that reads poses through the client API gets
  them after this modification. Uncorrected poses are visible only to a driver
  that intercepts the same call.

## Communication Between Driver and Application

- **Verified** — Named shared memory `SPACE_CALIBRATOR_NOVA` with named mutexes
  and events (`src/common/protocol.h:225`, `vendor/ipc.h:249-295`).
- **Verified** — Three shared buffers: the unmodified `DriverPose_t[64]` from the
  driver to the application; the transform table from the application to the
  driver, re-read on every pose update; and headset metadata with Virtual Desktop
  properties (`protocol.h:222-224`, `src/driver/ipc_server.cpp:107-137`).
- **Verified** — The handshake carries protocol version 5; a mismatch is only
  logged (`protocol.h:105-123`, `ipc_server.cpp:40-48`).

## One-Time Calibration

- **Verified** — Samples are pairs of world poses of the reference device and the
  target device, taken at 20 Hz from the unmodified poses; 100, 250 or 500 samples
  depending on the chosen speed (`src/overlay/calibration.h:13,62-66`). The two
  poses of a sample are not aligned in time (`calibration.cpp:63-84,662-703`).
- **Verified** — A sample is taken only when both poses are valid and
  `Running_OK` (`calibration.cpp:670-695`).
- **Verified** — Rotation: for all sample pairs the axes of the delta rotations
  of both devices are matched with the Kabsch algorithm through SVD. A pair counts
  when both delta angles exceed 0.4 rad; at least 200 pairs are needed
  (`calibration.cpp:121-203`, `calibration.h:27-32`).
- **Verified** — Translation: a linear least-squares system over all pairs,
  solved with SVD (`calibration.cpp:205-268`). `math.pdf` in the repository
  derives both steps.
- **Verified** — Validity: the RMS error of the "rigid link" must be at most
  0.1 m (`calibration.cpp:327-339`, `calibration.h:25-26`). In one-time mode the
  result is applied even when the checks fail (`calibration.cpp:1084`).

## Continuous Calibration

- **Verified** — The same solver runs on a sliding buffer; after each solution
  the older half of the buffer is dropped (`calibration.cpp:1051-1055,1098-1100`).
- **Verified** — A new solution is accepted when the solver thresholds pass, its
  RMS error is at most 0.1 m over the current window plus up to five earlier
  windows, and it is no worse than the current calibration recomputed on fresh
  data (`calibration.cpp:270-334,428-465`).
- **Verified** — In world mode an accepted solution is applied at once, with no
  smoothing (`tracked_device_provider.cpp:319-320`).
- **Verified** — The reference device does not have to be the headset. The device
  list shows every device of the chosen tracking system except base stations and
  display redirects (`src/overlay/user_interface.cpp:168-177`); the only rule is
  that reference and target belong to different tracking systems
  (`user_interface.cpp:268-270`). A Quest controller as reference and a Vive
  tracker as target is allowed by the code.
- **Hypothesis** — With a controller as the reference, quality drops: a
  controller outside the headset cameras' view may still be reported as valid
  while it is extrapolated from its IMU; a hand moves faster than a head and the
  samples are not aligned in time; the 0.1 m RMS limit is too coarse to reject
  such samples.

## Relative Mode

- **Verified** — "Stored relative to the headset" means relative to the reference
  device. The world calibration is converted to the pose of the target in the
  local frame of the reference, and the driver rebuilds the world calibration from
  the live poses of both devices on every update
  (`calibration.cpp:390-418`, `tracked_device_provider.cpp:252-310`). It works
  only together with continuous calibration (`calibration.cpp:1337`).
- **Hypothesis** — The latency estimator never writes its confidence output, so
  the blend factor stays at zero and the relative calibration freezes at its first
  value (`src/driver/latency_estimator.cpp:201-270,324-339`,
  `tracked_device_provider.cpp:304-308`).

## Origin Changes

- **Verified** — Chaperone events, `SeatedZeroPoseReset` and
  `StandingZeroPoseReset` clear the collected samples and metrics. The calibration
  itself is not corrected (`src/overlay/vr_core.cpp:306-354,489-495`).
- **Verified** — A jump detector exists. When the driver-to-world transform of
  the reference or the target device changes by more than 1° or 5 mm between
  ticks, the change is composed into the calibration so that the user does not
  notice (`calibration.cpp:705-783`, `calibration.h:21-22`).
- **Verified** — That detector is off by default in the current config version,
  with the comment "default to true whenever i fix it"
  (`src/overlay/config/configuration_data_versions.h:175`).
- **Verified** — The driver reads the Virtual Desktop setting `StageTracking`
  through Virtual Desktop's runtime library (`src/driver/virtual_desktop.cpp:99-102`),
  and the application warns when it is off, in advanced mode only
  (`src/overlay/user_interface.cpp:846`).

## Stored State

- **Verified** — `config.json` in `%APPDATA%/space-calibrator/`
  (`src/common/util.cpp:34-35`). Each calibration stores the transform (position
  in meters, yaw, pitch and roll in degrees), scale, anchor mode, continuous-mode
  flags, calibration speed, and the model, serial and tracking system of both
  devices (`src/overlay/config/configuration_data_versions.h:142-198`).

## License and Stack

- **Verified** — MIT, copyright Hyblocker 2023–2026 and Justin Li 2020–2022
  (`LICENSE:1-26`). The driver code may be used, changed and redistributed with
  the notice kept.
- **Verified** — Driver dependencies: MinHook (BSD-2), Eigen (MPL-2.0), fmt,
  quill, OpenVR SDK (`src/driver/CMakeLists.txt:126-152`). SimpleBLE, used only by
  the application for base station power control, is under BSL 1.1 or a
  commercial license (`LICENSE:633-637`).
- **Verified** — C++23, CMake, ImGui and ImPlot, GLFW (`CMakeLists.txt:1`,
  `.gitmodules`).

## Other Forks

- **Reported** — `bdunderscore/OpenVR-SpaceCalibrator`, branch `continuous-cal`:
  also no check of the reference device class. It has "static recalibration": a
  saved reference-to-target pose yields a calibration from a single pair of poses,
  without motion. Its RMS limit in continuous mode is 5 mm.
- **Reported** — [charliee1w/OpenVR-SpaceCalibrator-Quest][charliee1w]: a
  Quest-oriented fork that claims to detect origin shifts with thresholds of
  35 mm, 5° and three confirmations, and filters samples by Virtual Desktop
  latency. It needs a tracker on the headset.
- **Reported** — `xi-ve/openvr-space-calibrator-linux`: a Linux port; needs a
  tracker on the headset.

## What This Means for the Product

Reusable as it stands:

- the hook on `TrackedDevicePoseUpdated` and applying the correction through the
  driver-to-world transform;
- shared-memory communication between driver and application;
- the rotation and translation solvers with their thresholds;
- choosing devices by tracking system name;
- reading the Virtual Desktop stage tracking setting.

Missing for a setup with no tracker on the headset:

- judging the quality of a controller pose beyond "valid";
- aligning samples of the two systems in time;
- smoothing when a new calibration is applied in world mode;
- an RMS limit stricter than 0.1 m;
- holding the calibration while no bridge is visible.

[repo]: https://github.com/hyblocker/OpenVR-SpaceCalibrator
[charliee1w]: https://github.com/charliee1w/OpenVR-SpaceCalibrator-Quest
