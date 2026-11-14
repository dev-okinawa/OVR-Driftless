# Contributing to OVR Driftless

The project is in early development: the alignment method is not chosen and
nothing changes poses in SteamVR yet. Bug reports, measurements from real
hardware and focused pull requests are welcome.

## Before You Start

- Read the [README](../README.md) and the [documentation](../docs/README.md);
  the documents under `docs/` are the source of truth for requirements and
  technical contracts.
- For anything larger than a small fix, open an issue first and describe what you
  want to change. It saves work that does not fit the design.

## Setup

Requires Node 24 and npm 11 on Windows. All code is under `source/`; run every
command from there.

```sh
cd source
npm install
npm run dev:fake   # the interface on a fake SteamVR, no VR hardware needed
```

`npm run dev` starts the interface on a real SteamVR. The Simulator source in
Settings works without the core at all.

## Making a Change

1. Fork the repository and create a branch from `main`.
2. Keep the change focused: every changed line supports one purpose.
3. Update the documents under `docs/` in the same change when behavior, a
   contract, a command or a decision changes.
4. Run the checks:

   ```sh
   npm run typecheck
   npm test
   npm run build
   ```

5. Open a pull request and fill in the template.

## Conventions

- Code, comments, commit messages and documents are in English.
- TypeScript in strict mode, named exports, pure functions in `math/`. The full
  rules are in [coding-standards.md](../.claude/rules/coding-standards.md) and
  [architecture.md](../.claude/rules/architecture.md).
- Every pose and transform names its source and target space, for example
  `headsetFromLighthouse`.
- Tests sit next to the code as `*.test.ts` and cover the math and the logic.

## Changes That Need VR Hardware

Most behavior shows only on hardware. When you cannot run a check, or when you
report a result, write it as a scenario:

```text
Hardware: headset, streaming software, trackers, base stations
Start state: calibration profile, which devices are powered on
Steps: 1. … 2. …
Expected: …
Measure: how misalignment is observed and in what unit
```

A claim about alignment quality states numbers: the measured offset, the distance
from the calibration spot and the time since calibration.

## Conduct and Security

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report
vulnerabilities as described in the [Security Policy](SECURITY.md), not in a
public issue.
