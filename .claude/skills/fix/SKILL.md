---
name: fix
description: Diagnose reported defects (tracking misalignment, crashes, stored-data problems, mismatches between components) by comparing expected and actual behavior, gathering reproduction evidence from logs, crash reports and live sessions, identifying the root cause and assessing regression risks. Use for bug investigation or correction; pass the diagnosis to implement when a fix is requested.
---

# Defect diagnosis

## Report

- Extract observed and expected behavior, hardware (headset, streaming software,
  trackers, base stations), software versions, stored calibration state, steps,
  logs, callstacks or crash reports. Investigate missing details before asking for
  information already available.
- Read the relevant specs and design pages. A difference may be a code defect, a
  configuration or hardware issue, a documentation error or an unclear
  requirement; use `design` or `specification` when the contract itself is
  unresolved.
- For an investigation request, return the diagnosis and proposed correction; for
  a fix request, carry it through `implement`.

## Evidence and reproduction

- Trace the failing path. Read the application and VR runtime logs and crash
  reports around the failure.
- Reproduce with the smallest live-session scenario. Defects in persistent state
  need the calibration profile and config they were observed with, or the steps
  that produce them.
- When reproduction needs hardware the agent cannot drive, write the scenario for
  the user and treat the result as unknown until they report it.
- Record conditions, steps, expected and actual result. Do not describe an
  unexecuted scenario as reproduced; keep hypotheses separate from facts.
- If reproduction is unavailable or inconsistent, investigate timing
  (initialization order, device connect and disconnect, threading, runtime
  callbacks), configuration and hardware state. Missing reproduction limits
  verification but does not make a speculative fix correct.

## Cause and impact

- Identify the earliest incorrect assumption or operation that explains the
  symptom; test alternative causes against the evidence. Correct the cause rather
  than hiding its output.
- Use `code-explorer` for bounded questions about the failing path or consumers.
- Identify affected callers, contracts and stored data. Describe the smallest
  coherent correction.

## Handoff

Define the regression scenario: the observation distinguishing faulty from correct
behavior, plus adjacent cases that must keep working. For a requested fix, pass to
`implement` the expected behavior, reproduction and evidence, root cause, proposed
correction, risks and adjacent scenarios.

## Result

Report the cause with evidence, the proposed or implemented correction, the
regression scenario and its actual result (or that it is pending), and remaining
uncertainties. Claim the defect fixed only when verification supports it.
