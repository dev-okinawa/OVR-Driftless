# OVR Driftless

A VR utility in the spirit of OpenVR Space Calibrator. It aligns the Lighthouse
tracking space with the tracking space of a headset that does not use Lighthouse
(Quest, Pico and other inside-out headsets), so that Lighthouse devices such as
Vive trackers appear in VR where they physically are.

## Problem

A one-time calibration does not hold. During a session the two tracking spaces
drift apart, the virtual position of the trackers stops matching their physical
position, and the user has to recalibrate by hand.

## Goal

Keep the two spaces aligned automatically, with no manual recalibration during a
session. The method is not chosen yet.

The product does the initial calibration itself as well, by the same procedure as
OpenVR Space Calibrator, because two tools that change device poses in SteamVR
conflict. Until the product changes poses, the user calibrates in OpenVR Space
Calibrator and the product only observes.

## State

The stack is chosen (ADR 0001): a web interface, a Node core, a native driver
later. The 3D scene in `source/web/` works on live SteamVR data through the core
in `source/core/` (run on a Quest 3 through Virtual Desktop), on a simulated data source and
on recordings. The initial calibration runs in the interface; alignment during a
session is not started. The alignment method is not chosen; it depends on
measurements the scene will make.

## Where to Look

- `docs/design/design.md` — concept, problem, goal and open product questions.
- `docs/design/calibration/calibration.md` — requirements and open questions of
  the product's own calibration.
- `docs/research/space-alignment.md` — prior art, drift causes, candidate methods.
- `docs/architecture/architecture.md` — components, data flow, conventions.
- `docs/specification/scene/scene.md` — code map and contracts of the interface.
- `source/` — all code; commands are in `.claude/rules/toolchain.md`.
