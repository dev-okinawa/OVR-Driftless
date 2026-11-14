---
module: scene
parent: design/scene/scene.md
depends-on: []
code-anchor: source/web/src/skeleton
---

# Skeleton

---

## Goal

The user sees a body skeleton in the scene, driven by the headset, the
controllers and the worn trackers. The headset and controllers are tracked by one
system and the trackers by the other, and one body connects them: where the
skeleton cannot follow both, the trackers have moved away from the headset's
space. The skeleton makes drift visible without any device pair joined together.

---

## Preconditions

| Requirement | Detail |
|-------------|--------|
| Live scene | The [live scene](./live-scene.md) shows the headset, both controllers and the worn trackers |
| Trackers | Trackers are worn on the body and the scene knows which body part each is on |
| Body proportions | The skeleton's bone lengths match the user |

---

## Behavior

### Skeleton

- **R1** — The scene shows a humanoid skeleton with bones: head, spine, arms and
  legs, as in an avatar rig.
- **R2** — The head bone follows the headset. The hand bones follow the
  controllers.
- **R3** — A bone with a tracker on its body part follows that tracker.
- **R4** — The remaining bones are placed by inverse kinematics from the bones
  that follow devices.
- **R5** — The user can turn the skeleton on and off.
- **R6** — Before the skeleton is calibrated, it is shown with a default height:
  the head and the hands follow the headset and the controllers, the rest is
  placed by inverse kinematics, and the trackers drive no bone, since where each
  sits on the body is not known yet. No strain is shown before calibration.

### Strain

- **R7** — Where the skeleton cannot follow all its devices at once — a tracker
  farther from the head than the body allows, a leg longer than its bones, a foot
  below the floor — the affected bones are marked, and a strain figure shows by
  how much.
- **R8** — Strain is shown as a current number and as a graph over time, live and
  in replay.
- **R9** — While a device the skeleton follows is marked "tracking lost" or
  "disconnected", its bone is placed by inverse kinematics and takes no part in
  the strain figure.

### Interaction with Other Features

- A recording stores what the skeleton needs to be rebuilt in replay: the device
  poses, the body-part assignment of each tracker and the bone lengths
  ([recording-replay](./recording-replay.md)).
- The [desynchronization figures](./desync-figures.md) measure drift exactly but
  need a joined device pair. Strain is coarse and needs none. A session recorded
  with both shows how well strain follows the true drift.

---

## Edge Cases

- **E1** — Crouching, bending, sitting and lying change the shape of the body
  without any drift. Strain from the pose itself must not be read as drift.
- **E2** — A controller out of the headset cameras' view gives a degraded hand
  pose; the arm then follows a wrong hand.
- **E3** — A tracker that slips on its strap moves relative to its bone and
  produces strain that is not drift.

---

## Acceptance Criteria

Verifiable in a live session with the hardware named in Preconditions:

- **AC1** — The skeleton moves with the user: head, hands and every tracked body
  part match the user's own pose.
- **AC2** — With the spaces aligned, standing and walking keep strain near zero.
- **AC3** — After the headset is recentered away from its place, strain rises and
  the affected bones are marked.
- **AC4** — A replay of a recorded session shows the same skeleton and the same
  strain graph.

---

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | Which trackers are worn, and on which body parts? | Decides which bones follow a tracker and what strain can be measured | Waist and both feet | — |
| Q2 | Where do the bone lengths come from: an entered height, or a pose the user holds at the moment the spaces are aligned? | Wrong lengths produce constant strain | A pose held at the reference moment, which also fixes where each tracker sits on its bone | — |
| Q3 | Is the skeleton only a display and a drift indicator, or also an input to automatic alignment? | As an input it becomes part of the alignment method, with its own accuracy demands | Display and indicator first; its use for alignment is decided after strain is compared with true drift on recordings | — |
| Q4 | Which amount of strain counts as drift rather than ordinary body motion? | Decides when the user is told the spaces have drifted | — ; to be taken from recordings | — |

---

## Related Documents

- [Scene](./scene.md) — shared rules and open items
- [Space Alignment Research](../../research/space-alignment.md) — the skeleton fit
  among the original method candidates
