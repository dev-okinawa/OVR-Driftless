---
module: scene
parent: design/scene/scene.md
depends-on: []
code-anchor: none (planned)
---

# Headset View

---

## Goal

The user checks the scene without taking the headset off.

---

## Preconditions

| Requirement | Detail |
|-------------|--------|
| Desktop window | The [live scene](./live-scene.md) exists; the headset view comes after it |
| VR session | The user wears the headset with a VR application running |

---

## Behavior

- **R1** — The scene is viewable inside the headset.
- **R2** — The headset view shows the same devices, marks, trails and figures as
  the desktop window.
- **R3** — The view does not block the VR application the user is running. The
  user shows and hides it without taking the headset off.
- **R4** — The view stays steady while the head moves; the headset's own motion
  does not distort it.

---

## Acceptance Criteria

Verifiable in a live session with the hardware named in Preconditions:

- **AC1** — Inside a running VR application the user opens and closes the scene
  without removing the headset.
- **AC2** — The headset view and the desktop window show the same devices, marks
  and figures at the same moment.

---

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | How does the user show and hide the view? | It must not collide with inputs of the running VR application | A controller input the user chooses | — |
| Q2 | Is the view a panel showing the scene from outside, or are device markers drawn at their real positions around the user? | Markers at real positions show misalignment directly against passthrough or the body; a panel is simpler to read | — | — |

---

## Related Documents

- [Scene](./scene.md) — shared rules and open items
