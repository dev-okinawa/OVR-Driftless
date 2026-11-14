---
design: design/{module}/{node…}/{feature}.md
module: {module}
parent: specification/{module}/{node…}/{node}.md
depends-on: []
---

<!-- Feature specification: docs/specification/{module}/{node…}/{feature}.md.
     Describes technical behavior, contracts and verification. Implementation tasks and progress do not belong here.
     No status fields or approval labels. Delete sections that have no content.
     Relative links below assume a leaf directly under the module folder; add one `../` per extra node level. -->

# {feature}

**Design:** [design/{module}/{feature}](../../design/{module}/{feature}.md)

---

## Overview

Brief implementation summary.

## Code Map

| Type | Path | Role |
|------|------|------|
| {module / class / component / config} | `{path/from/project/root}` | ... |

## Data Model

| Struct / record | Field | Type | Constraints | Description |
|-----------------|-------|------|-------------|-------------|
| `...` | `...` | `...` | {required, range, default, unit} | ... |

## Contracts

### {Process boundary: IPC / runtime interface / file format}

| Message or call | Payload | Response | Errors |
|-----------------|---------|----------|--------|
| `...` | {fields} | {shape} | {failure modes and meaning} |

### {Module / Interface name}

| Direction | Signature | Description |
|-----------|-----------|-------------|
| Input | `functionName(param: Type)` | ... |
| Output | `ReturnType` / event emitted | ... |

## UI

| Window / overlay component | State it owns | Events it handles | Notes |
|----------------------------|---------------|-------------------|-------|
| `...` | ... | ... | {progress and error rendering} |

## Architecture

Modules, components and their relationships.

## Diagrams (optional)

**Mermaid** in a fenced `mermaid` code block: `flowchart` / `sequenceDiagram` for data and call flow, `stateDiagram-v2` for state machines, `classDiagram` for the data model.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `...` | `...` | `...` | {config key or user setting, with unit} |

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| {library / SDK / runtime / internal module} | Library / SDK / Runtime / Module | {why needed} |

## Edge Cases

Boundary conditions, error paths, interrupted actions (device disconnect, tracking loss, runtime restart mid-action).

## Security and Privacy

Anything this feature exposes over a network or to other processes, input validation, and personal or device data it stores. Omit if none.

## Compatibility

Stored profiles and config, runtime and SDK versions, and other software affected; migration required. Omit if none.

## Verification

Automated tests that cover the behavior:

| Test | Path | What it proves |
|------|------|----------------|
| {name} | `{path}` | ... |

Manual scenarios in a live session:

| Scenario | Hardware | Steps | Expected |
|----------|----------|-------|----------|
| {name} | {headset, trackers, base stations} | … | … |

## Implementation Notes

Details, workarounds, known limitations.

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | … | … | … | — |
