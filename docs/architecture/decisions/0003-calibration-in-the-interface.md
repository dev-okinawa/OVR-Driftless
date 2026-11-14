---
adr: 0003
title: Calibration computed and applied in the interface
date: 2026-11-14
superseded-by: —
---

# 0003 — Calibration computed and applied in the interface

## Context

The product does the initial calibration itself (design.md, Core Workflows).
ADR 0001 places alignment math in the core so that it keeps running with the page
closed, and only a driver can change poses in SteamVR. Today the core is a probe,
there is no live source and no driver; the interface runs on the simulator and on
recordings. The designer's interface opens with the calibration panel.

## Decision

- The initial calibration is computed in the interface, in
  `source/web/src/calibration/`. Its math is pure TypeScript with no DOM, device
  or time access, so it moves to the core unchanged.
- The solver fits the yaw and translation of `headsetFromLighthouse` and the
  rigid link of the pair from positions and the controller's rotation, assuming
  both runtimes are aligned with gravity. Space Calibrator's rotation step, from
  the axes of delta rotations, is not used: it cannot find the yaw offset when the
  pair turns about the vertical axis only, and it fits three rotation angles where
  gravity fixes two.
- The correction is applied by `CorrectionStage`, a decorator between the source
  and `SessionStore`. The scene, figures, skeleton and recorder see corrected
  poses; the calibration samples raw ones. A replay is not corrected.
- Nothing is stored between launches.

## Alternatives Considered

| Option | Why rejected |
|--------|--------------|
| Wait for the core and the driver | Blocks the designed first step of the product and its test on the simulator |
| Apply the correction inside `SessionStore` | Cannot be bypassed, but gives the store a second responsibility |
| Space Calibrator's 6-DOF solver | Degenerate for turning about one axis, and fits pitch and roll that gravity already fixes |

## Affected Systems

| System | Impact |
|--------|--------|
| Interface | New `calibration/` module; sources attach through `attachSource` |
| `PoseSource` | Optional `onOriginChange` |
| Simulator | Initial misalignment of the Lighthouse space; `wave` preset |
| Core, driver | Later take over computing and applying the same `headsetFromLighthouse` |

## Consequences

**Positive:**

- The whole calibration flow runs and is tested on the simulator now.
- The transform the driver will apply is the one computed and checked here.

**Negative / trade-offs:**

- Until the driver exists the correction exists only in the interface; SteamVR
  and the headset view do not change, so initial-calibration AC2 cannot be met.
- A source attached without `attachSource` bypasses the correction silently.
- The gravity assumption is a Hypothesis; a tilt between the floors stays in the
  fit error.

## Follow-up

- Move the solver to the core and apply the correction in the driver.
- Measure the thresholds and the latency between the systems on hardware.

## References

- [Architecture index](../architecture.md)
- [ADR 0001](./0001-web-interface-node-core.md)
- [Calibration specification](../../specification/calibration/calibration.md)
- [Space Calibrator Internals](../../research/space-calibrator-internals.md)
