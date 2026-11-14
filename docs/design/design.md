# OVR Driftless: Product Design Document

**Type:** VR utility
**Platforms:** First supported configuration — Quest 3 / 3S streamed with Virtual Desktop into SteamVR, SteamVR 2.0 base stations, Quest controllers in the hands, Vive trackers on the body or on objects

---

## Overview

### Concept in One Sentence

A utility that keeps the Lighthouse tracking space aligned with the tracking space
of a headset that does not use Lighthouse, automatically and for the whole session.

### Problem

A user combines a non-Lighthouse headset (Quest, Pico or another inside-out
headset) with Lighthouse devices such as Vive trackers. The two tracking systems
have separate coordinate spaces, so the user calibrates them against each other
with a tool such as OpenVR Space Calibrator.

The calibration does not hold. Some time into the session the spaces drift apart:
the virtual position of the trackers no longer matches their physical position,
and the user has to stop and recalibrate by hand.

### Goal

The spaces stay aligned without manual recalibration during a session, using only
the devices of the first supported configuration. Whether this is continuous
automatic alignment or another mechanism is not decided; see
[Space Alignment Research](../research/space-alignment.md).

---

## Core Workflows

### Initial Calibration

The same procedure as in OpenVR Space Calibrator:

1. The user joins a Quest controller and a Vive tracker together.
2. The user waves the joined pair; the product computes the alignment of the two
   spaces from the motion.
3. The user detaches the tracker and puts it where it is used.

Requirements: [initial calibration](./calibration/initial-calibration.md).

### Session

After the initial calibration nothing is rigidly attached across the two tracking
systems. The product keeps the spaces aligned from then on without the user
repeating the calibration.

### Calibration and Alignment in One Product

The product does both the initial calibration and the alignment during a session.
Two tools that change device poses in SteamVR conflict with each other, so the
product does not rely on another tool for calibration once it changes poses
itself.

Until the product changes poses, it only observes: the user calibrates in OpenVR
Space Calibrator and the scene shows and measures the result.

---

## Modules

| Module | Description | Index |
|--------|-------------|-------|
| `calibration` | The initial calibration of the two tracking spaces and keeping them aligned during a session | [calibration/](./calibration/calibration.md) |
| `scene` | 3D view of every tracked device in both tracking spaces, live and from recordings, with desynchronization figures | [scene/](./scene/scene.md) |

---

## Interface and UX

### Key Screens

| Screen | Purpose | Main elements |
|--------|---------|---------------|
| **3D scene** | Show where the two tracking systems place every device, and whether they agree | Headset, controllers, trackers, base stations, play-area bounds and floor, motion trails, body skeleton, desynchronization figures |

The 3D scene is part of the product, not a development aid. It is available in a
desktop window on the PC and inside the headset; the desktop window comes first.
Its requirements are in the [scene module](./scene/scene.md).

---

## Technical Constraints

- No Lighthouse tracker is available for mounting on the headset. Alignment
  methods that need one are excluded.

---

## Risks and Open Items

| ID | Question or risk | Why it matters | Proposed default | Answer |
|----|------------------|----------------|------------------|--------|
| Q1 | Which headset, streaming software (Virtual Desktop, Steam Link, ALVR) and base station version (1.0 or 2.0) must be supported first? | Decides which alignment methods are possible; the camera method needs 2.0 base stations, the hand-tracking method depends on the streaming software | — | Quest 3 / 3S, Virtual Desktop, base stations 2.0; Quest controllers in the hands plus Vive trackers |
| Q2 | Has continuous calibration with a tracker mounted on the headset been tried, and what is unsatisfactory about it? | It already solves the stated problem; the answer defines how this product must differ | — | Not tried: there is no spare tracker to mount on the headset |
| Q3 | Is the desynchronization a sudden jump or a gradual creep, and what precedes it? | A jump is fixed by detecting a shift of the headset origin; a creep needs continuous re-estimation | — | — |
| Q4 | Is extra hardware on the headset acceptable? | Excludes or allows the head-mounted tracker method | No extra hardware on the head | No: there is no spare tracker |
| Q5 | Is rooting the headset acceptable? | The only known camera-based method needs root on Quest | No root | — |

---

## Related Documents

- [Space Alignment Research](../research/space-alignment.md) — prior art, drift causes, candidate methods
