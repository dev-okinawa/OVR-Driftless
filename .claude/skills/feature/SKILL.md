---
name: feature
description: Coordinate delivery of new functionality using existing design pages, specifications and code. Use when the user asks to deliver a feature and needs design work, technical specification or implementation selected from the remaining work.
---

# Feature Delivery

## Understand the Request

Establish the intended user-facing outcome, scope, constraints and acceptance
criteria. Locate relevant design pages, specifications, research notes and
existing code, and compare the requested outcome with what is already documented
and implemented. Record the missing requirements, technical decisions and
implementation work in a session checklist. For a request limited to an artifact
or analysis, stay within it.

## Select the Needed Skills

| Work needed | Skill |
|---|---|
| Capture, clarify or revise requirements | `design` |
| Define or revise the technical solution before dependent code changes | `specification` |
| Implement the requested behavior | `implement` |
| Review changes or resolve a remaining quality concern | `quality` |

Existing documents may already cover the feature. When a gap appears during
implementation or review, resolve it with the relevant skill before continuing
dependent work. `implement` owns the detailed plan and verification; reuse its
results in the feature checklist.

Pass concrete document paths, requirement sections, decisions, code findings and
open questions into each skill. When the feature spans several documents or
modules, resolve shared decisions in their owning documents first.

## Result

Summarize the delivered behavior or artifacts, link the documents and changed
files, and report verification results, pending checks, remaining work and open
questions.
