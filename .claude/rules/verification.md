# Verification

Select the checks relevant to the change and reuse results that still apply. The
commands are in `.claude/rules/toolchain.md`.

| When | Check | Verifies |
|---|---|---|
| Any code change | Type check, unit tests and production build | No errors; no new warnings in touched files |
| Interface behavior changed | Run the development server on the simulator and look at the result in a browser | The interface shows what the design page describes |
| Calibration or transform math changed | Automated test on synthetic or recorded pose data | The computed transform matches the expected one within the tolerance the spec states |
| Behavior visible in the headset changed | Live-session scenario | Behavior matches the spec and the design acceptance criteria |
| Stored profile or config format changed | Load a file written before the change | Existing files load or fail as documented |
| Protocol between processes changed | Run both sides built from the same change | Both sides agree; a version mismatch fails as documented |
| Document changed | Follow its links and compare its code map with the code | Links resolve; paths and signatures exist |
| Research claim raised to **Verified** | Read the source or run the measurement, and record the conditions | The claim rests on first-hand evidence |

## Alignment Results

A claim about alignment quality states numbers: the measured offset between the
physical and the virtual position, the distance from the calibration spot, and the
time since calibration. "Looks aligned" is not a result.

## Live-Session Scenario Format

Every check on VR hardware is written as a scenario. When the agent cannot run it,
hand it to the user and report the check as pending until they confirm the result:

```text
Hardware: headset, streaming software, trackers, base stations
Start state: calibration profile, which devices are powered on
Steps: 1. … 2. …
Expected: …
Measure: how misalignment is observed and in what unit
Watch log for: …
```

## Troubleshooting Order

1. Build — compile and link errors, missing dependency.
2. Startup — the component is not loaded by the VR runtime, or is not running.
3. Devices — an expected device is missing, not tracking, or matched to the wrong role.
4. Coordinate spaces — pose taken in the wrong space, inverted transform, wrong
   multiplication order, mixed units, handedness or quaternion convention.
5. Timing — poses from different timestamps compared as simultaneous; latency
   between the two tracking systems.
6. Stored state — stale or incompatible calibration profile or config.
7. Environment — occlusion of base stations, a moved base station, the headset
   relocalizing or recentering.
