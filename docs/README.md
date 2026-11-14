# OVR Driftless Documentation

Entry point for the project documentation. The rules for writing and placing
documents are in `.claude/rules/documentation.md`.

| Document | Contents |
|---|---|
| [design/design.md](design/design.md) | Product design: concept, problem, goal, open product questions |
| [design/calibration/calibration.md](design/calibration/calibration.md) | Calibration module: the initial calibration by a joined controller and tracker; alignment during a session |
| [design/scene/scene.md](design/scene/scene.md) | Scene module: live 3D view, recording and replay, desynchronization figures, headset view |
| [specification/specification.md](specification/specification.md) | Specification layer index |
| [specification/calibration/calibration.md](specification/calibration/calibration.md) | Calibration module: the correction, `CorrectionStage`, the initial calibration's solver, controller and panel |
| [specification/scene/scene.md](specification/scene/scene.md) | Scene module: stack, code map, data model, contracts |
| [architecture/architecture.md](architecture/architecture.md) | Components, data flow, conventions, list of decisions |
| [research/space-alignment.md](research/space-alignment.md) | Why the tracking spaces drift apart, prior art, candidate alignment methods |
| [research/space-calibrator-internals.md](research/space-calibrator-internals.md) | How Space Calibrator 2.0 changes poses, calibrates and handles origin changes, read from its source |
| [research/questlhsync-spacesync-internals.md](research/questlhsync-spacesync-internals.md) | How QuestLHSync and OpenVR-SpaceSync align the spaces, read from their source, and whether they fit |
| [_templates/](_templates/) | One template per document type |
