<!-- Whole-product design document and design layer index: docs/design/design.md.
     One feature: feature_design_template.md.
     No status fields or approval labels. Delete sections that have no content. -->

# {Product Name}: Product Design Document

**Type:** {driver / desktop app / overlay / tool}
**Platforms:** {OS, VR runtime, supported headsets and tracking systems}
**Stack:** {language, frameworks, SDKs}

---

## Overview

### Concept in One Sentence

{What the product is, for whom, and what makes it worth using.}

### Problem

{What the user cannot do today, or does with pain. 1–2 paragraphs.}

### Core Loop

1. **{Step 1}** → {goal / activity}
2. **{Step 2}** → {goal / activity}
3. **{Step 3}** → {goal / activity}
4. **{Outcome}** → {what the user gets back}

### Product Principles

The internal compass for decisions: 3–4 qualities the product must have. Every feature is checked against them.

1. **{Principle 1}** — {what it means in practice}
2. **{Principle 2}** — {what it means in practice}
3. **{Principle 3}** — {what it means in practice}

### Non-Goals

- {What the product deliberately does not do, and why}

---

## Users and Roles

| Role | Who they are | What they need from the product |
|------|--------------|---------------------------------|
| **{Role}** | {description} | {main need} |

---

## Core Workflows

### {Workflow A}

{What the user is trying to achieve, the steps they take, and what counts as done.}

### {Workflow B}

{…}

---

## Modules

| Module | Description | Index |
|--------|-------------|-------|
| `{module}` | *(one-line purpose)* | [{module}/](./{module}/{module}.md) |

---

## Interface and UX

### Navigation

{How the interface is organized: windows, overlay pages, how the user moves between them, what works inside VR and what on the desktop.}

### Key Screens

| Screen | Purpose | Main elements |
|--------|---------|---------------|
| **{Screen}** | {why it exists} | {what is on it} |

### Feedback and States

{How the product reports progress, errors and success, including while the user wears the headset. Notifications.}

### Accessibility and Localization

{Readability inside VR, input without a keyboard, supported languages.}

---

## Domain Model

| Entity | Meaning | Key relations |
|--------|---------|---------------|
| **{Entity}** | {what it represents for the user} | {belongs to / has many} |

---

## Technical Constraints

{Supported hardware and runtime versions, latency and performance budgets, what the runtime and device SDKs allow, third-party software it must coexist with, privacy and security requirements.}

---

## Risks and Open Items

| ID | Question or risk | Why it matters | Proposed default | Answer |
|----|------------------|----------------|------------------|--------|
| Q1 | {question} | {what depends on it} | {option} | — |

---

## Related Documents

- [Specification index](../specification/specification.md) — technical specifications
- [Architecture](../architecture/architecture.md) — system architecture
