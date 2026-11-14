---
name: quality
description: Review changes for correctness, compatibility and stored-data risks, and consistency with design, specs and documented contracts. Use after implementation or for a requested quality review. The primary agent selects reviewers, resolves findings and coordinates authorized fixes and docs reconciliation.
---

# Quality review

## Scope

- Identify the changed files, relevant specs and design pages, decisions, check
  results and reproduction evidence. Keep unrelated changes out of scope.
- Reuse checks that passed for the current changes; missing or failed checks stay
  visible in the report.
- A review-only request returns findings and proposals; implementation work or a
  request to fix findings authorizes corrections within scope.

## Reviewers

Send `code-reviewer` one brief per focus. Always start with correctness of the
changed behavior; for bug fixes include the reproduction. Add a focus only when
the change warrants it:

- **Compatibility / stored data** — public interfaces, protocols between
  processes, stored profile and config formats, and loading of existing ones.
- **Conventions / architecture** — module boundaries, interfaces, established
  patterns.
- **Simplicity** — new abstractions, branching or repeated logic.

## Findings and corrections

Check findings against the evidence, remove duplicates and separate defects from
suggestions; explain any dismissal. Exclude unrelated cleanup. For authorized
fixes, send `code-implementer` a fix brief; review the result against the original
finding, then repeat the affected checks. After three fix briefs leave the same
finding unresolved, stop sending fix briefs: re-diagnose the cause with `fix`, or
ask the user with the evidence from all attempts. Ask about missing decisions,
scope expansion or accepting a material risk.

## Documentation

Send `docs-author` a verification brief for the documents the change affects. The
primary agent decides whether each mismatch is a code defect or a document to
update, then sends an update brief with exact files and agreed content. Requirement
changes go through `design`, technical decisions through `specification`. If
documentation is unaffected, say so without invoking an agent.

## Result

Report findings with severity and evidence, corrections made, checks run or
reused, pending scenarios, documentation updates and open questions. Claim delivery
complete only when required checks pass and material findings are resolved or
explicitly accepted by the user.
