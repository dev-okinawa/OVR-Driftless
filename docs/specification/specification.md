# Specification

How each module is built: code map, data model, contracts and verification. It
mirrors the [design layer](../design/design.md).

## Modules

| Module | Description | Index |
|--------|-------------|-------|
| `calibration` | The correction between the two tracking spaces: the initial calibration by a joined controller and tracker, and how the correction is applied in the interface | [calibration/](./calibration/calibration.md) |
| `scene` | The web application that shows tracked devices, records and replays sessions, and computes desynchronization figures and the skeleton | [scene/](./scene/scene.md) |
