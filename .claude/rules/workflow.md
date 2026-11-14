# Development Workflow

## Skills

Review or discussion calls for findings; a request to change or implement
authorizes that work. Do not create documents solely to pass a workflow stage.

| Work needed | Skill |
|---|---|
| Diagnose or correct a reported defect | `fix` |
| Coordinate delivery of new functionality across design, specification or implementation | `feature` |
| Analyze the impact of changes to existing functionality, including refactoring and compatibility | `improvement` |
| Implement a concrete change with settled behavior and approach, or an existing plan | `implement` |
| Review code or changed files, or finish standard implementation | `quality` |
| Capture, clarify or revise product design documents | `design` |
| Define or revise a missing, outdated or unclear technical solution | `specification` |

## Requirements and Technical Decisions

Before changing behavior, read the relevant documents under `docs/`, including
what they inherit from parent nodes.

Before coding, state assumptions that affect behavior, scope or the approach.
Surface plausible interpretations and consequential trade-offs instead of silently
choosing among them. Point out a simpler approach when one meets the goal, and
challenge unnecessary complexity with a concrete explanation. If the intended
behavior is unclear, name the uncertainty and resolve it before dependent edits.

Update known documentation gaps before dependent code changes. If code and
documentation disagree, establish the intended behavior: correct a code defect or
revise an inaccurate specification using the available evidence and user decisions.

## Verification

Define observable success criteria before implementing and tie each step to a
check from `.claude/rules/verification.md`. A clean build is not evidence that the
requested behavior works. Report unavailable checks and unresolved blockers
explicitly; never claim an unrun or failed check passed.

Most behavior in this project shows only on VR hardware. Checks the agent cannot
run go to the user as a live-session scenario and stay pending until they confirm
the result.

## Subagents

The primary agent owns scope, user communication and final verification. A
subagent brief must stand without the parent conversation: goal and bounded scope
with owned files, relevant paths and requirements, decisions, previous findings,
open questions and assigned checks. Writing agents preserve others' edits.

## Questions

Ask about unresolved facts, conflicting requirements or material choices that the
evidence cannot settle, and state what depends on the answer. Continue independent
work while those questions remain open.

## Completion

Report changed behavior or artifacts, paths, checks run, checks left to the user,
unresolved questions and limitations.
