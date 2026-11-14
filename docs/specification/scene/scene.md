---
layer: specification
module: scene
cross-link: design/scene/scene.md
---

# Specification — Scene

The web application in `source/web/`: structure, shared data model and the
contracts every part of the scene is built against.

**Layer:** `specification`

**Cross-link:** [design/scene](../../design/scene/scene.md)

---

## Children

| Child | Kind | Description | Doc |
|-------|------|-------------|-----|
| `live-scene` | leaf | The core, its WebSocket protocol and the live source | [live-scene](./live-scene.md) |

---

## Shared Rules and Current State

### Stack

Vite, TypeScript in strict mode, React for the application shell and panels,
three.js for the 3D scene, Vitest for tests. Decided in
[ADR 0001](../../architecture/decisions/0001-web-interface-node-core.md).

The interface is built from the Lit design kit `@ai-designer/ui`, used as web
components inside React ([ADR 0002](../../architecture/decisions/0002-design-kit-web-components.md)).
The kit is vendored as a tarball in `source/vendor/`. `lit` and the IBM Plex Sans
and Mono fonts (`@fontsource/*`) come with it.

### Code Map

All paths are under `source/web/src/`.

| Folder | Layer | Role |
|--------|-------|------|
| `domain/` | Types | Data types shared by everything: poses, devices, frames, sessions. No logic |
| `math/` | Math | Pure functions on vectors, quaternions and poses |
| `sources/` | Adapters | `PoseSource` and its implementations: `live/` (the core's WebSocket, see [live scene](./live-scene.md)), `simulator/` (with its Settings tab), `replay/` |
| `state/` | Application logic | `SessionStore`, the one place the active source feeds into |
| `calibration/` | Math, application logic, UI | The product's own calibration and the correction stage; see the [calibration specification](../calibration/calibration.md) |
| `recording/` | Application logic, UI | Recorder, the recording file format, the Record and Open buttons, the dialogs and the replay bar |
| `figures/` | Math, UI | Desynchronization figures of a device pair, their pair choice and the Graphs panel (the kit's time chart) |
| `skeleton/` | Math, UI | Skeleton model, inverse kinematics, strain, its panel and its scene layer |
| `scene/` | UI | The three.js view: CSS2D `ui-device-mark` marks without text labels, a floor grid that fades with distance from the camera target, play-area pads and corner brackets, motion trails, height lines to the floor, a camera glide on Reset view; `SceneLayer`; `deviceView.ts`, the one presentation of a device (mark shape and code, short name, tooltip) that the scene, the dock and the panels share |
| `kit/` | UI | `kit.ts` registers the kit's elements and loads its fonts, once, before the first render; `jsx.d.ts` types the elements for JSX |
| `app/` | UI | The Stage shell, see Interface below: status chip, top tools, device dock, hash routes, panels, dialogs, toast; the services; the annotations that store the pair and the skeleton calibration in a recording |
| `styles/` | UI | `tokens.css` imports the kit's tokens and adds page-wide rules |

`math/`, and the math files of `figures/` and `skeleton/`, import nothing from
React, three.js or the DOM, so they run in tests and can move to the core.

### Data Model

Defined in `domain/types.ts`.

| Type | Meaning |
|------|---------|
| `Vec3` | `[x, y, z]` in meters |
| `Quat` | Unit quaternion `[x, y, z, w]` |
| `Pose` | A rigid transform `aFromB`: `position` and `rotation` |
| `DeviceInfo` | What stays fixed for a device: `id`, `role`, `trackingSystem`, `name`, `serial`, optional `bodyPart` |
| `DeviceSample` | One device at one moment: `id`, `state`, `pose` (`worldFromDevice`, last known when not tracking, null when never tracked) |
| `DeviceState` | `tracking`, `tracking-lost`, `disconnected` |
| `TrackingSystem` | `headset` or `lighthouse` |
| `PlayArea` | Bounds polygon on the floor with its tracking system |
| `SessionInfo` | `devices`, `playAreas`, `floorHeight` |
| `Frame` | `time` in seconds since the session started, and one `DeviceSample` per device of the session |

Coordinates are right-handed, +Y up, -Z forward, in meters.

### Contracts

#### `PoseSource` — `sources/source.ts`

| Member | Contract |
|--------|----------|
| `kind` | `simulated`, `replay` or `live`; shown in the interface at all times |
| `start(listener)` | Begins producing data; called once |
| `stop()` | Stops; no listener call happens after it returns |
| `listener.onStatus` | `connecting`, `running`, `unavailable` with a message, or `ended` |
| `listener.onSession` | Called before the first frame and again whenever a device joins or leaves or a play area changes |
| `listener.onFrame` | Called for every frame in time order; each frame matches the most recent session |
| `listener.onOriginChange?` | Optional. `{ time, trackingSystem }`: the origin of one tracking system moved (a headset recenter); poses before and after are in different spaces. A source that cannot know it never calls it |

#### `SessionStore` — `state/sessionStore.ts`

| Member | Contract |
|--------|----------|
| `attach(source)` | Stops the previous source, clears the session, starts the new one. The application does not call it directly: `attachSource` (`app/services.ts`) calls `store.attach(stage.wrap(source))`, so every source passes the correction stage |
| `detach()` | Stops the source and clears the session and the frame |
| `getSnapshot`, `subscribe` | The slowly changing state for React: source kind, status, session, state of each device |
| `onStatus` | A status of `connecting` or `unavailable` clears the session and the frame, so no stale pose is drawn, measured or recorded |
| `frame` | The most recent frame, or null |
| `subscribeFrames(listener)` | Called for every frame with the frame and its session; frames never pass through React state |

#### `SceneLayer` — `scene/layer.ts`

Something drawn into the 3D scene on top of the devices. The scene view owns the
renderer and the camera and calls `attach(scene)` once,
`update(frame, session, camera)` on every animation frame that draws a frame,
after the camera has moved for it, `setVisible`, and `detach()`.

#### `SceneView` — `scene/SceneView.tsx`

A React component that fills its parent and owns a `SceneController`, which owns
the renderer, camera, controls and everything drawn. Frames are read from the
store on the animation frame, never through React state.

| Prop | Contract |
|------|----------|
| `store` | The `SessionStore` to draw; a new store rebuilds the view |
| `options` | `SceneOptions`, below |
| `layers` | Optional `SceneLayer`s; added when they appear in the list, detached when they leave it |
| `highlightDeviceIds` | Optional; devices whose marks are emphasized (the declared pair, the selected device, the calibration pair) |
| `resetViewSignal` | Optional; changing the number returns the camera to the default view (a short glide, at once with reduced motion) |
| `onDeviceClick` | Optional; called with the id of the mark that is clicked, not dragged over |

`SceneOptions` — `scene/sceneOptions.ts`:

| Field | Meaning |
|-------|---------|
| `showTrails` | Motion trails of moving devices |
| `trailSeconds` | How much history a trail keeps, seconds |
| `showPlayAreas` | Play-area pads and brackets |
| `showHeightLines` | A hairline from every device to the floor, ending in a small ring |

### Interface

`app/App.tsx` lays the interface out in the kit's `ui-stage`: the 3D scene fills
the stage and the controls float over it in named regions.

| Region | Content |
|--------|---------|
| Top left | The product plate (`ProductPlate`) and the status chip (`StatusChip`): the calibration, the drift of the declared pair and the data source; each part opens its panel |
| Top right | `TopTools`: the view toggles (trails, bounds, skeleton, height lines), then Measurements, Graphs, Record, Open recording and Settings |
| Panel | One floating panel at a time: Calibration, Measurements or Settings |
| Wide panel | Graphs |
| Above bottom | Toasts and the replay bar |
| Bottom | The device dock (`DeviceDock`): a tile per device and the Calibrate action |
| Over the scene | Plates for connecting, no data and no devices (`ScenePlates`) |

The open panel is part of the address (`app/routes.ts`): `#/scene` is the scene
alone, and `#/calibration`, `#/measurements`, `#/graphs` and `#/settings` open
the panel of that name; an unknown hash is `#/scene`. Dialogs (a recording
that cannot be opened or saved, discarding a recording, leaving a running
calibration, removing the calibration) are modal, and a polite live region
announces results.

States, texts, focus order and the behavior of each panel are defined by the
designer's UI contracts, `docs/ui/scene.md` and `docs/ui/calibration.md` in the
design workspace `\\wsl.localhost\Ubuntu-22.04\home\user\dev\ai-designer`. They
are not copied here.

### Current State (as built)

Implemented and run on the simulator and on recordings: the live source, the
default on launch, which takes devices and poses from SteamVR through the core
([live scene](./live-scene.md)), run on a Quest 3 through Virtual Desktop; Settings switches
between SteamVR and the simulator; the interface on the designer's Stage layout; the 3D view with `ui-device-mark` marks by role, tracking
system and state, trails, play areas, height lines, a fading floor grid and camera;
the simulator with motion presets, drift, jumps, tracking loss, disconnects and a
tracker joined to a controller, started with a demonstration misalignment of the
Lighthouse space (8° and 300 mm) so that a calibration has something to correct;
the product's own calibration, which corrects the poses the interface shows,
measures and records ([calibration](../calibration/calibration.md)); recording to
a JSON Lines file and replay with pause, seek and speed; desynchronization
figures of a device pair; the skeleton, which until calibrated has the default
height of 1.7 m and follows only the headset and the controllers, and once
calibrated follows the trackers too and shows strain; the Graphs panel with the figures and the strain on one time axis.

Not implemented:

- the headset view;
- a recording that survives a crash: the recorder keeps the session in memory and
  writes the file when the recording stops;
- the whole-session graph in a replay: the Graphs panel spans the whole recording
  on its axis, but the lines are rebuilt as the replay plays, so they cover the
  session up to the replay position; seeking back drops what lies after it.

Known limits:

- A recording takes about 90 kB per second at 60 frames a second with eight
  devices.
- The strain tolerances in `skeleton/strain.ts` (`STRAIN_TUNING`) are provisional
  and were checked only against simulated motion.
- The skeleton is drawn in three.js, not with the kit's `ui-spatial-view`, but
  the same way: `skeleton/rigBones.ts` lays a Unity humanoid rig (bones named
  after `HumanBodyBones`, 15 finger bones per hand, toes) over the solved joints,
  with the designer's spine segments, hand, finger and foot proportions;
  `skeleton/boneShape.ts` ports the kit's octahedral bone; `skeleton/skeletonLayer.ts`
  draws the silhouette and the camera-facing facet edges in pixel-wide lines
  with a ring at each joint, and a strained bone in the critical tone with a
  heavier outline. The model solves 16 joints; the extra bones only follow them,
  and strain marks a drawn bone through the model bone it belongs to (never a
  finger). The hands turn with the controllers; the feet point along the body,
  because how a tracker sits on its foot is not calibrated.
- The pair and its reference, and the skeleton calibration, are stored in a
  recording as annotations of kind `figures` and `skeleton` (`app/figuresAnnotations.ts`,
  `app/skeletonAnnotations.ts`).

---

## Verification

Run from `source/`:

| Check | Command |
|-------|---------|
| Types | `npm run typecheck` |
| Unit tests | `npm test` |
| Production build | `npm run build` |
| Manual, in the browser | `npm run dev` (it starts the core too), then open `http://localhost:5173` |

---

## Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| `react`, `react-dom` | uses | Panels and application shell |
| `three` | uses | 3D scene, including its CSS2D renderer for device marks |
| `@ai-designer/ui` | uses | The design kit: web components and tokens; vendored tarball `source/vendor/ai-designer-ui-0.1.0.tgz`, [ADR 0002](../../architecture/decisions/0002-design-kit-web-components.md) |
| `lit` | uses | Runtime of the kit's components |
| `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` | uses | The kit's fonts, loaded in `kit/kit.ts` |
| [calibration](../calibration/calibration.md) | uses | `CorrectionStage` between every source and `SessionStore`; the calibration panel and dialogs hosted by the shell |
| Core (`source/core/`) | uses | Live sessions and frames over a WebSocket; the interface imports its `protocol.ts` ([live scene](./live-scene.md)) |
