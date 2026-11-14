# Architecture

The stack is decided in ADR 0001: a web interface in `source/web/` (Vite,
TypeScript, React, three.js), a Node core in `source/core/`, and a native driver
later. The interface is built from the design kit's web components (ADR 0002). The alignment method is not chosen. Components and data flow are described
in `docs/architecture/architecture.md`.

## Source Layout

All code is under `source/`. Feature code lives in the domain folder that owns it;
in the interface these are the folders of `source/web/src/` listed in
`docs/specification/scene/scene.md`. Put new code where ownership is clear, not in
a broad folder because it is convenient. Create a new domain folder only when no
existing owner fits.

## Layers

Build and reason in this order; dependencies flow the same way:

1. **Types** — poses, transforms, samples, config structures.
2. **Math** — calibration and transform computation as pure functions over the
   types: no device, runtime, file or UI access.
3. **Interfaces** — when two or more parts must talk without knowing each other's
   concrete types.
4. **Adapters** — the only code that calls the VR runtime and device SDKs; it
   converts their data into project types.
5. **Application logic** — orchestrates sampling, calibration and applying the
   result.
6. **UI** — shows state and sends commands; owns no calibration logic.

## Coordinate Spaces

- Every pose and transform has an explicit source and target space, and its name
  states both (for example `headsetFromLighthouse`).
- The project uses one convention for handedness, units, rotation representation
  and multiplication order, documented in `docs/architecture/cross-cutting/`.
  Conversion from a runtime's or SDK's convention happens in its adapter and
  nowhere else.
- A pose carries its timestamp and its validity. Poses from the two tracking
  systems are compared only after they are brought to the same moment.

## Coupling

- Cross-module communication goes through interfaces or events — not direct use of
  another domain folder's concrete classes, unless that integration point is
  documented in the spec.
- Runtime and SDK types do not leak past the adapters.
- Code that runs on every pose update does not block: no file, network or UI calls
  on that path.

## Data and Events

- Tunable values (thresholds, sample counts, rates, tolerances) live in config or
  exposed settings — not hardcoded.
- Tracking loss, device disconnect and invalid poses are expected inputs, not
  exceptional ones; every consumer of a pose handles the invalid case.
- Prefer events and explicit state transitions over polling where the runtime
  offers them.

## Compatibility

- A stored calibration profile or config file carries a format version. Changing a
  stored field affects files written by earlier versions.
- A protocol between processes carries a version; a mismatch is detected, not
  assumed away.
- Other software may share the runtime and change the same device poses. Known
  conflicts are documented in the spec of the feature they affect.
