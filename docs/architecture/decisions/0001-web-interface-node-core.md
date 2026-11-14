---
adr: 0001
title: Web interface, Node core, native driver
date: 2026-11-13
superseded-by: —
---

# 0001 — Web interface, Node core, native driver

## Context

The product needs three things: a 3D scene with recording, replay, figures and a
skeleton; a process that reads device poses from SteamVR; and, once the product
corrects poses itself, a driver loaded into SteamVR.

The scene is the first deliverable. It only reads poses, so it needs no driver.
The user will read and change the interface code and chose web technology over
Unity. A browser cannot call SteamVR, so the interface needs a separate process
to supply poses. Changing poses in SteamVR is possible only from a native driver.

## Decision

- **Interface** — a web application: Vite, TypeScript, React for the panels,
  three.js for the 3D scene. It lives in `source/web/`.
- **Core** — a background Node process that reads poses from SteamVR by calling
  the OpenVR C API in `openvr_api.dll` through the `koffi` FFI library, with no
  native build step. It lives in `source/core/`. It will serve poses to the
  interface over a WebSocket.
- **Driver** — C++, written when the product starts correcting poses. The
  MIT-licensed Space Calibrator driver is the starting point.
- **Order** — the interface is built first against a simulated data source. The
  simulator, a replay and the live connection implement one interface, so the
  scene does not depend on which one feeds it.
- **Code location** — all code is under `source/`; the project root holds only
  documentation and tool configuration.
- **Name** — the product is called OVR Driftless; `ovr-driftless` in package
  names, file names and the recording format.

## Alternatives Considered

| Option | Why rejected |
|--------|--------------|
| Unity application | Skeleton and inverse kinematics come built in and an in-headset overlay is proven, but it is heavy next to a running VR game and the user prefers web |
| Fork of Space Calibrator 2.0, all C++ | Calibration, driver and overlay already exist, but the 3D scene and the skeleton would be written by hand on OpenGL in a foreign beta codebase |
| `node-openvr` native addon for the core | Last published in May 2022; a native addon is a build risk on Node 24 |
| Core in C# with the official OpenVR binding | Reliable, but a second language beside TypeScript; kept as the fallback |

## Affected Systems

| System | Impact |
|--------|--------|
| Scene module | Built as a web application |
| Headset view | Harder than in Unity: a SteamVR overlay takes a texture from a process, not a web page. The browser window shown through the VR desktop view is the starting point |
| Alignment math | Lives in the core, not in the browser page, so that it keeps running when the page is closed |

## Consequences

**Positive:**

- One language, TypeScript, for the interface, the core and the math.
- The interface can be developed and tested with no VR hardware.
- The core has no build step and uses the DLL shipped with SteamVR.

**Negative / trade-offs:**

- The in-headset view needs separate work later.
- Recording in the browser keeps the session in memory; a recording that survives
  a crash needs the core.
- The FFI binding is written by hand against one version of the OpenVR interface
  (`IVRSystem_026`).

## Follow-up

- Confirm on hardware that the core reads poses: the probe `source/core/src/probe.mjs`
  loads the DLL and calls it, but has run only without SteamVR. If poses cannot
  be read, the core moves to C#.
- Move the shared types from `source/web/src/domain/` to a package used by both
  the interface and the core when the core starts serving poses.

## References

- [Architecture index](../architecture.md)
- [Space Calibrator Internals](../../research/space-calibrator-internals.md)
