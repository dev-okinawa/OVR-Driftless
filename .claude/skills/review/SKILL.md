---
name: review
description: Code review checklist — confidence scoring and the rule sections to check a change against. Loaded by the code-reviewer agent; not an entry point. A user request to review code or changed files goes to the quality skill, which selects the reviewers.
---

# Code Review

## Scope

The files or diff named in the brief, including added files that belong to the
change.

## Confidence Scoring

Rate each issue 0–100 and report only issues with confidence **≥ 75**. Severity is
assessed separately, from the effect on tracking correctness, stored data,
stability or maintainability.

| Score | Meaning |
|---|---|
| 75 | Very likely real; affects behavior or violates a project rule |
| 90 | Confirmed with evidence from code or project rules |
| 100 | Certain — breaks the build, crashes, corrupts stored data or breaks an existing contract |

## Checklist

Check the change against the coding standards and architecture rules, the spec
and design pages including ancestor node specs. Cite the rule section in each
finding. Additionally:

- Existing stored profiles, config and consumers of changed contracts keep working.
- No undocumented product rule is enforced in code; deviations from the spec are
  flagged, not absorbed.
- Transforms name their source and target space, and their units, consistently
  with the spec.

## Report

Order findings by impact: crashes and memory safety, stored data and
compatibility, correctness, architecture, style. Each finding has severity,
confidence, file:line, a failure scenario or rule reference, and a concrete fix.
