---
name: improvement
description: Analyze changes to existing functionality against current behavior, design, specs and code. Use to identify affected consumers (callers, other processes, stored profiles and config), compatibility risks and documentation needs before implementing an enhancement, retuning or refactoring.
---

# Changes to existing functionality

## Baseline

- Identify the requested outcome, existing behavior and constraints. Use `fix`
  instead when the task is a reported defect.
- Find the relevant design pages, specs and implementation; compare documented
  intent with current code and note discrepancies with file references.
- Use `code-explorer` for a bounded question about implementation or consumers.
- For an analysis-only request, return findings and a proposed scope.

## Impact

Name the affected consumers, the contract each relies on and the consequence of the
change. Consider only what the request touches:

- Callers, subclasses, interface implementers and event subscribers.
- Other processes that speak a changed protocol.
- Stored calibration profiles and config files written by earlier versions.
- The VR runtime interface and other software sharing the runtime.
- UI that shows or edits the affected state.
- Parameters and thresholds that other features read.

For each breaking consumer, state the compatibility measure (default, migration on
load, protocol version) or what must be updated. Do not assume a requested change
authorizes unrelated breakage; raise material choices the evidence cannot settle.

## Handoff

Use `design` for changed requirements and `specification` for changed contracts,
updating owning documents in place. For a requested change, pass to `implement` the
intended behavior, affected paths, consumers, compatibility constraints, risks,
decisions and the scenarios proving new and preserved behavior.

## Result

Report the scope, affected contracts and consumers, compatibility risks,
documentation needs and open questions; if implemented, include the result and
verification evidence.
