---
module: calibration
parent: design/calibration/calibration.md
depends-on: []
code-anchor: source/web/src/calibration/
---

# Initial Calibration

---

## Goal

The user aligns the two tracking spaces at the start of a session inside the
product, with the devices already in use: no tracker on the headset and no other
calibration tool.

---

## Preconditions

| Requirement | Detail |
|-------------|--------|
| Device pair | A Quest controller and a Vive tracker that can be joined rigidly for the time of the calibration |
| Tracking | Both devices of the pair are tracked: the controller by the headset, the tracker by Lighthouse |
| No other tool | No other tool that changes device poses is running ([calibration](./calibration.md) R1) |

---

## User Flow

1. The user joins a Quest controller and a Vive tracker together.
2. The user starts the calibration.
3. The user waves the joined pair.
4. The product computes the alignment from the motion and applies it.
5. The user detaches the tracker and puts it where it is used.

---

## Behavior

### Procedure

- **R1** — The calibration uses one pair: a Quest controller and a Vive tracker
  joined rigidly. No other device and no other user action takes part.
- **R2** — While the user waves the pair, the product collects the motion of both
  devices and computes the alignment of the two spaces from it.
- **R3** — The product applies the result itself.
- **R4** — After the result is applied, the user detaches the tracker. The result
  keeps applying and does not depend on the pair staying joined.
- **R5** — Motion from a time when either device of the pair is marked "tracking
  lost" or "disconnected" is not used.

### Interaction with Other Features

- Desynchronization figures — they are measured on the same joined pair. The end
  of a calibration is a moment when the spaces are aligned and the pair is still
  joined ([desync-figures](../scene/desync-figures.md)); see Q8.
- Scene — the scene is read-only. The controls of the calibration are not part of
  the scene ([scene](../scene/scene.md) R1).

---

## Parameters

| Parameter | Value | Where it is set |
|-----------|-------|-----------------|
| How much motion a calibration needs | — | — |
| Limit above which a result counts as failed | — | — |

The values Space Calibrator uses are in
[Space Calibrator Internals](../../research/space-calibrator-internals.md); see
Q10.

---

## Edge Cases

- **E1** — The tracker is detached before the result is applied. The calibration
  is not complete.
- **E2** — Either device of the pair loses tracking or disconnects while the user
  waves. R5 applies; what happens to the motion collected so far is Q5.
- **E3** — The controller leaves the view of the headset cameras while the user
  waves. The expected behavior is not decided; see Q4.
- **E4** — The headset recenters while the user waves. The expected behavior is
  not decided; see Q6.
- **E5** — The user moves the pair too little, or without turning it. The
  expected behavior is not decided; see Q7.

---

## Acceptance Criteria

Verifiable in a live session with the hardware named in Preconditions:

- **AC1** — With a tracker joined to a controller and no other calibration tool
  running, waving the pair ends in an applied result.
- **AC2** — After the tracker is detached and put on a marked physical spot, it
  appears at that spot in VR. The offset is stated in millimeters, together with
  the distance from the calibration spot and the time since the calibration. The
  acceptable offset is [calibration](./calibration.md) Q5.

---

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | How are the controller and the tracker of the pair chosen? | The wrong pair gives a wrong calibration | The user picks one device of each tracking system from a list | — |
| Q2 | How does the user start the calibration and see its progress and result while wearing the headset? | The desktop window is out of reach in VR; the same question is open for the reference moment ([desync-figures](../scene/desync-figures.md) Q2) | — | — |
| Q3 | What counts as a failed calibration, and what happens then? | Space Calibrator applies the result of a one-time calibration even when its checks fail (Verified in its source) | A failed result is not applied, the previous calibration stays, the user sees the error figures and can repeat | — |
| Q4 | What happens when the controller leaves the view of the headset cameras while the user waves? | A controller out of view may still be reported as tracked while its pose is extrapolated (Hypothesis), and such motion would spoil the result | Settle by a measurement on hardware | — |
| Q5 | When a device of the pair loses tracking mid-wave, does the collection pause and resume, or start over? | Decides how forgiving the procedure is | Pause and resume | — |
| Q6 | What happens when the headset recenters while the user waves? | Motion collected before and after the recenter belongs to different headset spaces; Space Calibrator discards its samples (Verified in its source) | Discard the collected motion and tell the user | — |
| Q7 | What does the user see when the motion is not enough to compute the alignment? | The rotation step of Space Calibrator needs the pair to be turned, not only moved (Verified in its source) | Tell the user to turn the pair as well as move it | — |
| Q8 | Does the end of a calibration set the reference moment of the desynchronization figures and the moment the skeleton is fitted to the body? | Both need a moment when the spaces are aligned, and the pair is still joined then | Offer it at the end of the calibration | — |
| Q9 | How does the user repeat a calibration and remove one? | The user needs a way to repeat it and a way back to no correction | A new result replaces the old one only once it is applied; a reset removes the correction | — |
| Q10 | How much motion does a calibration need, and which limit makes a result failed? | Fills the Parameters table | Start from the values of Space Calibrator; its error limit of 0.1 m is probably too coarse with a controller as one device of the pair (Hypothesis) | — |

---

## Related Documents

- [Calibration](./calibration.md) — shared rules and open items
- [Initial Calibration Specification](../../specification/calibration/initial-calibration.md) — solver, sampling, controller and panel
- [Calibration Specification](../../specification/calibration/calibration.md) — the correction and the correction stage
- [Product Design Document](../design.md) — core workflows
- [Desynchronization Figures](../scene/desync-figures.md) — the same joined pair, used for measurement
- [Space Calibrator Internals](../../research/space-calibrator-internals.md) — how the existing tool calibrates
