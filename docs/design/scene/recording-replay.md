---
module: scene
parent: design/scene/scene.md
depends-on: []
code-anchor: source/web/src/recording
---

# Recording and Replay

---

## Goal

The user captures a session and studies it afterwards: when the spaces drifted
apart, how fast, and what happened just before.

---

## Preconditions

| Requirement | Detail |
|-------------|--------|
| Live scene | The [live scene](./live-scene.md) is showing devices |

---

## User Flow

1. The user starts a recording from the desktop window.
2. The user uses VR as usual; the scene stays live.
3. The user stops the recording and chooses where to save the file.
4. Later the user opens the file and replays it in the same scene.

---

## Behavior

### Recording

- **R1** — The user starts and stops a recording from the desktop window. An
  indicator is visible while the recording runs.
- **R2** — A recording contains everything the scene drew: every device with its
  role and name, its pose and tracking state over time, the bounds and the floor,
  the declared device pairs with their reference moment, and the time of each
  sample.
- **R3** — The live view keeps working while a recording runs.
- **R4** — A recording is a file. The user chooses where to save it and can open
  it after restarting the application.
- **R5** — When a recording is interrupted (application crash, VR runtime exit,
  disk full), the part captured so far stays openable, and the user is told.

### Replay

- **R6** — A replay draws what was drawn live: poses, trails, "tracking lost" and
  "disconnected" marks, and figures.
- **R7** — Replay has play, pause, seek and speed control.
- **R8** — The scene looks visibly different in replay, so a replay cannot be
  mistaken for the live view.
- **R9** — Opening a file that is not a recording, or an unreadable one, shows a
  message and leaves the current view unchanged.

### Interaction with Other Features

- The [desynchronization figures](./desync-figures.md) of a replay are those of
  the recorded session; the graph cursor follows the replay position.

---

## Parameters

| Parameter | Value | Where it is set |
|-----------|-------|-----------------|
| Sample rate of a recording | — | — |
| Replay speed steps | — | — |

---

## States and Feedback

| State | What the user sees |
|-------|--------------------|
| Idle | Live scene, no recording indicator |
| Recording | Live scene with the recording indicator |
| Replay | The recorded session with replay controls and the replay mark |
| Failed | A message naming what went wrong: interrupted recording, unreadable file |

---

## Acceptance Criteria

Verifiable in a live session with the hardware named in Preconditions:

- **AC1** — A two-minute recording that includes a tracking loss, reopened after
  restarting the application, replays the same poses, trails, loss marks and
  graph.
- **AC2** — Ending the application process during a recording leaves a file that
  opens and replays up to the interruption.
- **AC3** — Opening a file that is not a recording shows a message; the live view
  is unchanged.
- **AC4** — During a replay the scene is marked as a replay in a way visible in a
  screenshot.

---

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | Does a recording have a size or duration limit? | Long sessions are where drift shows; a limit could cut them short | No limit; warn when disk space is low | — |
| Q2 | During a replay, is live data still received and shown anywhere? | Decides whether the user can watch a recording and the live session at once | Live data is still received; only the replay is drawn | — |

---

## Related Documents

- [Scene](./scene.md) — shared rules and open items
- [Desynchronization Figures](./desync-figures.md)
