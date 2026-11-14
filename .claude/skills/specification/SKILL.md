---
name: specification
description: Create, review and maintain technical specifications in docs/specification/ before implementation. Use when design requirements need a technical solution, an existing spec needs changing, or code and documented contracts need reconciling.
---

# Technical specifications

## Delegation

Run `code-architect` with the request, design page, existing spec paths,
constraints, known decisions and exploration findings; run `code-explorer` first
when a concrete codebase question (current behavior, consumers, dependents) needs
separate investigation. Check the proposed solution, handle user questions and edit
the specification yourself.

## Scope

- Accept a design page, an existing spec, source material or a change request.
  Locate relevant documents before creating new ones.
- Trace intended behavior to the design page or explicit user requirements. Use
  `design` when requirements are unclear; do not decide product behavior inside a
  spec.
- A request to create or update a spec authorizes those edits. For a review or
  discussion, return findings or a proposal.

## Writing the spec

- Start a new spec from `docs/_templates/specification_template.md`. Fill the
  relevant sections with concrete content from the agreed solution; omit
  inapplicable sections and sample text.
- Link design flows and acceptance criteria instead of copying them.
- A contract may rest only on verified facts. When the solution depends on a
  `docs/research/` claim that is reported or a hypothesis, verify it first or
  record the dependency in Open Items.
- For a change, update affected contracts, code map, edge cases and verification
  together; preserve unrelated content and decisions.
- Check that referenced code and document paths exist.

## Result

Report the documents created or updated, the technical decision and remaining
questions.
