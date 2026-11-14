---
design: design/calibration/initial-calibration.md
module: calibration
parent: specification/calibration/calibration.md
depends-on: [specification/scene/scene.md]
---

# Initial Calibration

**Design:** [design/calibration/initial-calibration](../../design/calibration/initial-calibration.md)

---

## Overview

The user chooses a controller of the headset and a Lighthouse tracker, joins
them rigidly and waves them. The controller samples the raw poses of the pair,
solves for `headsetFromLighthouse` and applies it through `CorrectionStage`
([calibration](./calibration.md)). The panel follows the designer's UI contract
`docs/ui/calibration.md` in the design workspace (states CAL-01…CAL-17) and
shows the controller's snapshot; it holds no calibration logic.

## Code Map

All paths are under `source/web/src/`.

| Type | Path | Role |
|------|------|------|
| Math | `math/mat3.ts`, `math/linearSolve.ts` | 3×3 matrices, symmetric eigenvalues; Gaussian elimination with pivoting, `null` for a singular system |
| Type | `calibration/pairSample.ts` | `PairSample`: `time`, `headsetFromController` (pose), `trackerInLighthouse` (position) |
| Math | `calibration/solveCalibration.ts` | The solver below |
| Math | `calibration/motionCoverage.ts` | Rotation spread `ρ`, horizontal travel, progress |
| Math | `calibration/applyCorrection.ts` | `correctFrame`, `correctSession` |
| Config | `calibration/calibrationConfig.ts` | `CalibrationConfig`, `DEFAULT_CALIBRATION_CONFIG` |
| Logic | `calibration/correctionStage.ts` | `CorrectionStage` |
| Logic | `calibration/pairSampler.ts` | Takes samples of the pair from raw frames |
| Test data | `calibration/pairFixtures.ts` | Seeded synthetic samples of a joined pair |
| Interface | `calibration/pairGesture.ts` | `PairGesture`: what the user's hands do, implemented only by the simulator |
| Interface | `calibration/measurementTargets.ts` | `ReferenceTarget` (figures) and `SkeletonFitter` (skeleton), the measurements the Done options set |
| Logic | `calibration/resetMeasurementsOnCorrectionChange.ts` | Clears the reference and the skeleton fit when the correction changes ([calibration](./calibration.md)) |
| Logic | `calibration/calibrationController.ts` | State machine, snapshot, commands |
| UI | `calibration/CalibrationPanel.tsx` | The panel in the stage's `panel` slot |
| Adapter | `sources/simulator/simulatorPairGesture.ts` | `PairGesture` over `SimulatorControls` |

## Data Model

| Struct | Field | Type | Description |
|--------|-------|------|-------------|
| `CalibrationResult` | `headsetFromLighthouse` | `Pose` | The applied correction |
| | `controllerId`, `trackerId` | `string` | The pair |
| | `samples` | `number` | Samples the solution used |
| | `fitErrorMm` | `number` | RMS residual of the rigid link, millimeters |
| | `appliedAt` | `Date` | Wall-clock time it was applied |
| `CalibrationFailure` | `reason` | `{ reason: 'degenerate' } \| { reason: 'fit-error', fitErrorMm, limitMm }` | Why the last attempt failed |
| `CalibrationSnapshot` | `phase` | `idle \| delay \| collecting \| paused \| computing \| done \| failed` | |
| | `pair` | `{ controllerId, trackerId } \| null` | |
| | `controllers`, `trackers` | `readonly DeviceInfo[]` | Candidates: controllers of the headset system, trackers of the Lighthouse system |
| | `blocked` | `CalibrationBlock \| null` | `{ reason }` of `source-unavailable`, `replay`, `no-controller`, `no-tracker`, `no-pair`, or `{ reason: 'pair-not-tracking', deviceId }` |
| | `delayLeftSeconds` | `number` | Whole seconds, during `delay` |
| | `startDelaySeconds` | `number` | The configured delay, for the panel's texts and ring |
| | `progress` | `number` | 0…1, never decreases within one collection |
| | `pausedDeviceId` | `string \| null` | The device of the pair that is not tracking |
| | `stalled` | `boolean` | In `collecting`, progress has not risen by a whole percent for `stallSeconds` of collecting time (CAL-10); paused time does not count |
| | `discarded` | `boolean` | Collected motion was dropped after an origin change (CAL-11) |
| | `failure`, `result` | | `result` is the correction in effect; a failed attempt keeps it |
| | `doneOptions` | `{ reference: 'pair-not-tracking' \| null; skeleton: 'headset-not-tracking' \| null }` | Why a Done option cannot apply now; null when it can |
| | `canJoinOnSimulator` | `boolean \| null` | Whether the simulator can join the chosen pair; null when the source is not simulated |

## Contracts

### Solver — `solveCalibration(samples)`

Unknowns: the yaw angle `θ` and translation `t` of `headsetFromLighthouse`, and
`q`, the tracker's origin in the controller's frame (the rigid link). For sample
`i` with controller position `p_c`, rotation `R_c` (headset space) and tracker
position `p_t` (Lighthouse space), in meters:

```text
p_c(i) = Ry(θ) · p_t(i) + t − R_c(i) · q
```

`Ry(θ)` is the rotation of `quatFromYaw(θ)`. For a fixed `θ` the system is
linear in `(t, q)`. With `A_i = [I₃ | −R_c(i)]` the three least-squares problems
for the right-hand sides `d_i = p_c − (0, y_t, 0)`, `e_i = (x_t, 0, z_t)`,
`f_i = (z_t, 0, −x_t)` share one normal matrix; the residual at `θ` is
`rd − cos θ · re − sin θ · rf`, so the cost is a trigonometric polynomial of
degree 2 in `θ`. It is minimized by a 1° scan and golden-section refinement; then
`(t, q)` follow. `fitErrorMm` is the RMS of the 3D residual. The tracker's
rotation is not used.

Returns `{ headsetFromLighthouse, linkInController: q, fitErrorMm }`, or `null`
when the normal matrix is singular.

### Motion coverage — `motionCoverage(samples, config)`

- `ρ = sqrt(1 − σ_max(R̄)²)`, `R̄` the mean of the controller rotation matrices,
  `σ_max²` the largest eigenvalue of `R̄ᵀR̄`. `ρ = 0` when every rotation keeps
  one direction: turning about one axis only leaves part of `q` and `t`
  unobservable.
- Travel: square root of the largest eigenvalue of the horizontal covariance of
  the controller positions, meters. `θ` needs horizontal motion.
- Progress = `min(samples / samplesNeeded, ρ / minRotationSpread, travel / minTravelMeters)`,
  each term clipped to 1.

### `PairGesture` — `calibration/pairGesture.ts`

| Signature | Contract |
|-----------|----------|
| `canJoin(controllerId, trackerId): boolean` | Whether the source can join this pair (simulator: right controller and waist tracker) |
| `startWaving(controllerId, trackerId)` | Collecting starts: join the pair if possible, wave |
| `stopWaving()` | Collecting ended: motion returns to the previous preset; the pair stays joined |
| `release()` | The user detaches the tracker (Done) |

The app gives the controller a gesture only while the source is the simulator.

### `CalibrationController` — `calibration/calibrationController.ts`

| Command | From | Result |
|---------|------|--------|
| `choosePair(controllerId, trackerId)` | `idle`, `done`, `failed` | Pair set; `done` and `failed` return to `idle` and clear `failure`; from `done` the gesture is released |
| `start(): boolean` | `idle`, `done`, `failed`; not blocked | `delay`; `false` when blocked |
| `cancel()` | `delay` … `computing` | `idle`, pair kept, correction unchanged |
| `tryAgain(): boolean` | `failed` | As `start` with the pair kept |
| `finish({ setReference, fitSkeleton })` | `done` | With `setReference`, sets the pair and its reference in `PairFigures`; with `fitSkeleton`, fits the skeleton in `SkeletonStrain`; an option whose precondition fails (`doneOptions`) is not applied; releases the gesture unless a reference was set, since a reference measures the drift of the still joined pair; returns `{ referenceApplied, skeletonApplied }`; phase `idle`. Both use the latest corrected frame of the store |
| `dismissResult()` | `done`, `failed` | Leaves the result step: `done` finishes without options; `failed` returns to `idle` with the pair kept and `failure` cleared |
| `dismissDiscarded()` | any | Clears `discarded` |
| `remove()` | a result in effect | `CorrectionStage.clear()`, `result` null |

Transitions:

- `delay` → `collecting` after `startDelaySeconds` of raw frame time, counted
  from the first raw frame after `start`. Collecting and paused form one waving
  span: `gesture.startWaving` is called when it begins, `stopWaving` when
  collection ends (computing, cancel, a source reset), not on a pause.
- A sample is taken every `1 / sampleRateHz` of frame time while both devices
  of the pair are `tracking` with a pose. Otherwise `paused` with the device
  named; it resumes on its own (design Q5).
- An `OriginChange` of either system drops the samples, sets `discarded`, and
  collection continues (design Q6); in `computing` it returns to `collecting`
  and the waving span starts again.
- Progress 1 → `computing` on the next raw frame, then the solver: success
  applies the result (`done`, CAL-13); a fit error over `maxFitErrorMm` or a
  singular system gives `failed` and keeps the previous correction (design Q3).
- A change of source or a null session resets the phase to `idle`.
- The snapshot is published on a change of phase, whole second, whole percent,
  flag or result, not on every frame.

## UI

| Component | State it owns | Events it handles | Notes |
|-----------|---------------|-------------------|-------|
| `CalibrationPanel` | Step 1 or 2 while `idle` (choose, join); nothing else | Kit events of its controls, `ui-close` | Steps 3 and 4 follow `phase`; dialogs CAL-15 (leave during waving) and CAL-17 (remove) |

The app shell opens the panel at launch without an address (`#/calibration`),
puts the calibration part in the status chip and the Calibrate / Recalibrate
action at the end of the dock, and holds "Remove calibration" in Settings,
as in the contract.

## Configuration

`DEFAULT_CALIBRATION_CONFIG`; every value is provisional (Open Items Q1).

| Option | Default | Description |
|--------|---------|-------------|
| `sampleRateHz` | 20 | As Space Calibrator |
| `samplesNeeded` | 250 | 12.5 s at 20 Hz |
| `startDelaySeconds` | 5 | Time to put the headset on and pick up the pair |
| `minRotationSpread` | 0.15 | `ρ`, about radians |
| `minTravelMeters` | 0.10 | Horizontal travel |
| `stallSeconds` | 2 | Progress unchanged this long → `stalled` |
| `maxFitErrorMm` | 30 | A larger fit error fails |

## Edge Cases

- A device of the pair loses tracking or disconnects: `paused`, samples kept.
- The chosen pair is not joined (another pair on the simulator): the solver
  converges to a large fit error → `failed`; a pair that is not turned stays
  `stalled` until Cancel.
- Replay: `blocked: replay`; the stage would not apply a result anyway.
- Another tool that changes poses (design calibration R1, Q3) is not detected:
  the panel tells the user to turn it off.
- The tracker is detached before Done (E1) is not detected; the instruction says
  to keep the pair joined.

## Compatibility

The recording format is unchanged: recordings hold corrected poses, as the
user saw them. A recording made before this change replays as before.

## Verification

| Test | Path | What it proves |
|------|------|----------------|
| Solver without noise | `calibration/solveCalibration.test.ts` | Known `θ`, `t` (with `t_y ≠ 0`) and `q` recovered within 1e-6 rad and 1e-6 m |
| Solver with 2 mm noise, 250 samples | same | `θ` within 0.25°, `t` within 5 mm |
| Unjoined pair | same | `fitErrorMm > maxFitErrorMm` |
| Coverage | `calibration/motionCoverage.test.ts` | `ρ = 0` for yaw only and for one horizontal axis; travel 0 without motion |
| Simulator ground truth | `calibration/calibrationController.test.ts` | On the simulator with an initial misalignment and the `wave` preset the result matches `getTrueMisalignment` within 0.1° and 3 mm |
| Controller phases | same | Delay, pause and resume, discard on a jump, cancel, failure keeps the previous result, remove, blocks |
| Stage | `calibration/correctionStage.test.ts` | Raw tap sees raw poses, the store sees corrected ones; replay uncorrected; session identity cached |
| Math | `math/mat3.test.ts`, `math/linearSolve.test.ts` | Eigenvalues and solutions of known matrices; singular systems give `null` |

Manual scenario on hardware (pending: there is no live source and no driver):

| Scenario | Hardware | Steps | Expected |
|----------|----------|-------|----------|
| AC2 | Quest, streaming software, a Vive tracker, base stations | Join the tracker to a controller, calibrate, detach the tracker, put it on a marked spot | The offset in VR in millimeters, with the distance from the calibration spot and the time since the calibration |

## Implementation Notes

The simulator starts with the Lighthouse space misaligned (`lighthouseOffset`
in `SimulatorOptions`, chosen by the app) so the calibration has something to
correct, and has a `wave` preset that turns both hands about two axes. A jump
emits `OriginChange` for the headset system.

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | Which values of `minRotationSpread`, `minTravelMeters` and `maxFitErrorMm` hold with a Quest controller and a Vive tracker? | They decide "not enough turning" and "failed" (design Q7, Q3, Q10) | The defaults above; measure on hardware | — |
| Q2 | How late are Quest poses relative to Lighthouse poses? | Speed × latency is a floor of the fit error; samples of both systems are taken from one frame | Not modeled; measure | Partly: the latency is not measured, but its effect shows. Quest 3 through Virtual Desktop with a VIVE Tracker 3.0: fast waving gave a fit error of 38.1 mm (failed); slow, smooth waving passed |
