---
name: design
description: Work with product design documents in docs/design/. Use when a feature idea needs to be captured as design requirements, a supplied design draft needs structuring or review, existing requirements need changing, or the user's answers need incorporating.
---

# Product design documents

## Delegation

Run `design-analyst` before editing a design page or presenting review findings,
with the user's request, supplied material, relevant document paths, known answers
and constraints. Check its findings against the request, ask the user about missing
decisions and apply the document edits yourself.

## Scope

- Determine what the user wants: document a new idea, organize a supplied draft,
  review completeness, incorporate answers, or change an existing requirement.
  A supplied Markdown path alone does not determine the action.
- A request to create or change a design page authorizes those edits. A request
  only to review or discuss calls for findings or a proposal.
- If no target is given, search `docs/design/` by feature and domain terms before
  creating a new page. Ask when several plausible targets would change the scope.
- A new page starts from its template in `docs/_templates/`.
- Distinguish requested behavior from verified current behavior. Code is evidence
  of what exists, not a reason to replace the user's intent.

## Describing requirements

- Preserve the source's intent, concrete facts, references and constraints; do not
  replace detailed material with a vague summary.
- Write rules as observable behavior and acceptance criteria as outcomes checkable
  in a live session with the hardware the page names. Keep existing identifiers
  stable; give new ones distinct IDs.
- Do not invent parameter values, supported hardware or user decisions to fill a
  template; record them as open questions.
- Claims taken from `docs/research/` keep their evidence level. Do not write a
  hypothesis or a reported claim as an established requirement.
- Classes and code belong in the specification, not the design page.

## Applying a change

- Locate the changed requirement and every section that depends on it; update them
  together. A narrow change produces a narrow edit, not a regenerated page.
- For shared behavior, update the owning node and check its children for
  contradictions.
- Incorporate the user's answers into the requirements and acceptance criteria
  themselves, not only the questions table.

## Result

Report the created or updated paths, the substantive result, unresolved decisions
and linked specifications that now need reconciliation.
