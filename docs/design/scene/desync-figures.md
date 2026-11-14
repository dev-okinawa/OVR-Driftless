---
module: scene
parent: design/scene/scene.md
depends-on: []
code-anchor: source/web/src/figures
---

# Desynchronization Figures

---

## Goal

The user gets numbers for how far the two tracking spaces have drifted apart, and
sees from a graph whether the drift was a sudden jump or a gradual creep.

---

## Preconditions

| Requirement | Detail |
|-------------|--------|
| Device pair | A Vive tracker rigidly attached to a Quest controller. One device of the pair is tracked by the headset, the other by Lighthouse |
| Live scene | The [live scene](./live-scene.md) shows both devices of the pair |

A tracker mounted on the headset is not available, so a tracker attached to a
controller is the only pair in the first supported configuration.

In normal use the tracker is detached from the controller after the initial
calibration. The figures are therefore available only while a pair is attached:
during the initial calibration and in sessions made for measurement.

---

## User Flow

1. The user attaches a tracker to a controller and declares the two devices a
   pair.
2. While the spaces are aligned, the user sets the reference moment.
3. The scene shows the distance and angle figures and a graph that grows with the
   session.

---

## Behavior

### Pair and Reference

- **R1** — The user declares two devices a pair.
- **R2** — The user sets a reference moment, meaning "the spaces are aligned
  now". The relative pose of the pair at that moment is the reference.
- **R3** — Until a reference moment is set, no figures are shown for the pair.
- **R4** — The scene does not check that the pair is rigidly attached. The user is
  told that the figures mean something only for rigidly attached devices.

### Figures

- **R5** — The distance figure is how far the relative position of the pair has
  moved from the reference, in millimeters.
- **R6** — The angle figure is how far the relative orientation of the pair has
  turned from the reference, in degrees.
- **R7** — Both figures are shown as current numbers and as a graph over time.
- **R8** — While either device of the pair is marked "tracking lost" or
  "disconnected", no figure is computed. The graph shows a gap, not zero and not
  a flat line.
- **R9** — The graph covers the whole session, live or replayed.

### Interaction with Other Features

- A recording stores the pairs and their reference moments; a replay shows the
  recorded figures, and the graph cursor follows the replay position
  ([recording-replay](./recording-replay.md)).

---

## Edge Cases

- **E1** — A Quest controller is tracked by the headset cameras. When the pair
  leaves their view, the controller pose degrades or is lost; figures from that
  time fall under R8 when the runtime reports the loss.
- **E2** — The reference moment is set while the spaces are already misaligned.
  The figures then show drift relative to that state, not absolute misalignment.

---

## Acceptance Criteria

Verifiable in a live session with the hardware named in Preconditions:

- **AC1** — With a tracker attached to a controller, declared a pair and the
  reference set, holding the pair still keeps both figures near zero.
- **AC2** — Covering the tracker so that it loses tracking produces a gap in the
  graph for that time.
- **AC3** — Carrying the pair across the room and back changes the figures by
  whatever the spaces disagree by, and the change is visible in the numbers and on
  the graph.
- **AC4** — After a recenter of the headset, the figures and the graph show the
  step.

---

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | Can the user declare more than one pair? | Two controllers allow two pairs; more pairs separate a rotation error from a position error | One pair | — |
| Q2 | How does the user set the reference moment while wearing the headset? | The desktop window is out of reach in VR | A control in the desktop window until the [headset view](./headset-view.md) exists | — |

---

## Related Documents

- [Scene](./scene.md) — shared rules and open items
- [Product Design Document](../design.md) — open item Q3, jump or creep
- [Initial Calibration](../calibration/initial-calibration.md) — the same joined pair, used to align the spaces
