---
name: implement
description: Implement requested behavior with a lightweight path for clear local changes and a delegated standard path for broader work. Covers planning, delegation, verification and documentation reconciliation.
---

# Implementation

## Before production edits

Turn the request into observable checks:

- **New or changed behavior:** the automated test or live-session scenario that
  shows it.
- **Defect:** the reproduction scenario from `fix`, showing the faulty result
  before and the correct result after.
- **Refactor:** the behavior that must stay identical, including every consumer of
  the changed code.

## Choose the execution path

Use the lightweight path when all of the following hold:

- Expected behavior and the technical approach are clear from the request,
  existing contracts and code.
- The change is local to one module or class, with known callers and effects.
- It does not change public interfaces, a protocol between processes, a stored
  profile or config format, or the build configuration and dependencies.
- A build and one targeted check can verify the outcome.

Choose by impact and uncertainty, not diff size. Switch to the standard path when
new dependencies, contract conflicts or broader risks appear; keep completed work.

## Lightweight path

The primary agent implements and verifies directly; delegation and a separate
`quality` review are optional unless requested or needed for a concrete concern.

- Read affected code, callers and existing documentation. Do not create documents
  solely to enter this path; update affected existing docs.
- Run the checks the change triggers (`.claude/rules/verification.md`) and the
  targeted scenario.
- Review the final diff, callers and documentation against the requested behavior.

## Standard path

**Context.** Locate the relevant specs and design pages. Verify affected files,
interfaces and consumers against the documented solution; use `code-explorer` for
unresolved questions. Use `specification` when the technical solution is missing or
unclear and `design` when requirements are. If the behavior already exists, report
it or plan only the remaining changes.

**Plan.** Reuse a plan from `fix`, `improvement` or the user after checking it
against current code. Break work into focused tasks in dependency order; each task
has a goal, spec sections, owned files, dependencies and a verifiable definition of
done. Include build checkpoints, test and live-session scenarios and documentation
reconciliation as plan items.

**Delegation.** Send each task to `code-implementer`. Execute one task at a time
in dependency order and keep a log of changed files for later briefs. On the
report:

- `DONE`: check the definition of done.
- `DONE WITH DEVIATIONS`: assess the difference and record agreed decisions for
  documentation reconciliation.
- `BLOCKED`: resolve the missing evidence or decision and send a focused brief.

**Verification.** Run every check the change triggers yourself; send failures to
`code-implementer` as a fix brief and repeat the affected checks after each
correction. Hand scenarios that need VR hardware to the user and report them as
pending. Then run `quality` with the changed files, spec/design paths, check
results, pending scenarios and risks.

**Correction limit.** After three fix briefs for the same failing check leave it
failing, stop sending fix briefs: re-diagnose the cause with `fix`, or ask the user
with the evidence from all attempts. The same limit applies on the lightweight
path to your own corrections.

## Result

Report the implemented behavior, important files, check results, pending
live-session scenarios, open questions and reconciled documents.
