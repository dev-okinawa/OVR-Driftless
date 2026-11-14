---
module: {module}
parent: design/{module}/{node…}/{node}.md
depends-on: []
code-anchor: {owning folder, module or class | none (planned)}
---

<!-- Feature design page: docs/design/{module}/{node…}/{feature}.md.
     Whole-product document: design_template.md.
     No status fields or approval labels. Delete sections that have no content.
     Relative links below assume a leaf directly under the module folder; add one `../` per extra node level. -->

# {Feature Name}

[Spec](../../specification/{module}/{feature}.md) *(remove while there is no specification)*

---

## Goal

{Which user problem the feature solves and which product principle it serves. 1–3 sentences.}

---

## Preconditions

| Requirement | Detail |
|-------------|--------|
| {hardware / runtime state / prior setup} | {what must be present or done before the feature works} |

---

## User Flow

1. {Entry point: where the user starts}
2. {Action} → {what the user sees}
3. {Result: what counts as done}

---

## Behavior

### {Rule group / subsystem}

- **R1** — {observable behavior: condition → user action → what changes in data and UI}
- **R2** — {…}

### Interaction with Other Features

- {feature} — {how they affect each other} ([link]({path}))

---

## Parameters

| Parameter | Value | Where it is set |
|-----------|-------|-----------------|
| {limit, default, timeout} | {number, or `—` if undecided} | {config / constant / user setting} |

---

## States and Feedback

| State | What the user sees |
|-------|--------------------|
| Idle | {…} |
| In progress | {…} |
| Failed | {message, recovery action} |
| Done | {confirmation} |

---

## Edge Cases

- **E1** — {boundary condition or failure → expected behavior}

---

## Acceptance Criteria

Verifiable in a live session with the hardware named in Preconditions:

- **AC1** — {condition and observable result}
- **AC2** — {boundary case or failure}

---

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | {question} | {what depends on it} | {option} | — |

---

## Related Documents

- [Specification](../../specification/{module}/{feature}.md) — technical specification
- [{Related design page}]({path}) — {relation}
