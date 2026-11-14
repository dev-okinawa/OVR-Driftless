# Documentation (`docs/`)

Docs are the source of truth for product requirements and technical contracts.
Documentation is part of every change: a task is not done until the docs describe
the project as it is after the change.

## When to Update

Update the docs in the same change as the code when the change:

- adds, changes or removes a feature, command, endpoint or configuration option;
- changes the architecture, the data model or a dependency;
- changes how the project is installed, built, run or deployed;
- makes a decision a future reader would otherwise have to guess at (write an ADR).

Before finishing a task, check whether any existing doc now says something false,
and fix it.

## Language

All documentation is written in English, even when the conversation is in another
language. The same holds for code comments and commit messages.
Identifiers, class names and paths stay exactly as they are in code.

## Questions

Do not add lifecycle status fields, status columns, approval labels or state
transitions to documents.

Record unresolved questions and ambiguities in Open Items and explain what depends
on each answer. Only those that affect the requested work block it; save known
content and continue independent work. Check relevant parent/child documents and
linked specs directly, without aggregating document statuses or requesting formal
sign-off when there is no unresolved decision.

Question records contain an identifier (`Q1`, `Q2`, …), the question, why it
matters, any proposed default and the actual answer (or `—` if unknown). Do not add
a separate question status. Keep Open Items consistent with the questions that
remain unanswered or unclear.

Preserve recorded answers and their question identifiers. Resolve questions
affected by the task without deleting their answers; do not remove or reorganize
unrelated answered questions merely to tidy Open Items.

## Writing Style: Current State Only

A document describes the current requirements, technical decisions or verified
implementation for its purpose. Distinguish requested behavior from what already
exists; planned functionality is not evidence of implemented behavior. History
lives in version control and ADRs, not in the document body.

When updating a doc, **rewrite the affected sections in place** so the result
contains no trace of the change process:

- **No delta/changelog blocks** — no `**2026-08-13 delta:** …`, "Changes in this iteration" or "What's new". Fold the change into existing prose, tables and rules.
- **No commit/task artifacts** — no commit hashes, ticket IDs or session references in the document structure. A ticket ID may appear only inside an ADR.
- **No before/after narratives** — avoid "previously X, now Y". State only the current behavior.
- **No dated annotations** in specs — a decision needing dated rationale is an ADR (`architecture/decisions/`), linked from the spec.
- **Remove stale content** — delete or rewrite what the change makes obsolete; do not append a correction next to it.

**Exception**: ADRs in `architecture/decisions/` are historical records by nature.

## Canonical Layout

```text
README.md                        # Project entry point: what it is, quick start, link to docs/
docs/
├── README.md                    # Docs entry point: links to the layer indexes and folders
├── design/                      # WHY / WHAT: user goal, behavior, requirements, acceptance
│   ├── design.md                # Product design document and layer index (Modules table)
│   └── {module}/…               # Node/leaf tree, see below
├── specification/               # HOW: code map, data model, interface and UI contracts
│   ├── specification.md         # Layer index
│   └── {module}/…               # Mirrors design/ 1:1
├── research/                    # Prior art, investigations and measurements, one topic per file
├── architecture/                # architecture.md, cross-cutting/, decisions/ (ADRs NNNN-title.md)
├── infrastructure/              # setup, environment, configuration, CI, deployment, tooling
├── testing/                     # Test strategy, how to run and write tests
└── _templates/                  # One template per document type, see Templates
```

Create a file or folder when there is real content for it; do not add empty
placeholders.

## Templates

Start every new document from its template in `docs/_templates/`: copy the file,
fill the `{placeholders}`, keep the section order, and delete the guidance comment
and any section that has no content. Fix relative links for the document's real
depth in the tree.

| Document | Location | Template |
|---|---|---|
| Whole-product design and design layer index | `design/design.md` | `design_template.md` |
| Module index (level-1 node), either layer | `{layer}/{module}/{module}.md` | `module_template.md` |
| Nested node index (level 2 and deeper), either layer | `{layer}/{module}/{node…}/{node}.md` | `submodule_template.md` |
| Feature design (leaf) | `design/{module}/{node…}/{slug}.md` | `feature_design_template.md` |
| Feature specification (leaf) | `specification/{module}/{node…}/{slug}.md` | `specification_template.md` |
| Architecture decision | `architecture/decisions/NNNN-title.md` | `adr_template.md` |

Documents without a template (`docs/README.md`, `specification/specification.md`,
`research/`, `architecture/`, `infrastructure/`, `testing/`) follow the Format
section; a layer index is a one-line scope plus a Modules table.

When a document type needs a section its template lacks, add the section to the
template first, so every document of that type keeps the same shape.

## Research Notes (`research/`)

A research document records what is known about a topic and how well it is known.
Mark every claim with its evidence level and define the levels used at the top of
the document:

- **Verified** — read in source code or measured on hardware in this project;
- **Stated by project** — a project's own README or documentation, unchecked;
- **Reported** — a third-party article, guide or user report;
- **Hypothesis** — an unchecked idea.

List sources with links. When a claim is verified or refuted, rewrite it in place.
A finding that becomes a requirement moves to `design/`; one that becomes a
technical decision moves to `specification/` or an ADR, and the research document
links there.

## The Node Rule (`design/` and mirrored `specification/`)

Documents form a node/leaf tree. **A node is a folder** containing:

- `{node}.md` — the node's own document;
- `{slug}.md` — leaf documents (one feature);
- `{child-node}/` — nested child nodes following the same rule, to any depth.

A new level is created **only when a node has ≥2 children with their own
requirements**; otherwise the child stays a leaf `{slug}.md` under its parent.
Do not restructure existing leaves to add a level. Walk the `parent` frontmatter
chain to resolve inherited content.

### What Belongs in a Node Document

A node document holds only what is true for **two or more** of its children:

- shared rules and mechanics whose change affects all children (e.g. for
  `calibration`: shared sample model, transform conventions, validity thresholds);
- **Current State (as built)** — a minimal description of what already exists in
  this area, reconstructed from actual code;
- shared questions, risks and references that affect more than one child;
- the Children table.

A node does **not** hold one feature's requirements, edge cases or acceptance
criteria — those live in the leaf. Tie-breaker: true for one child → leaf; true
for two or more → nearest common node. A node with no shared content stays a pure
index (overview + Children table).

### Grounding a Node Path

Taxonomy comes from code and the existing `docs/` tree, never from the prose of a
source document:

- Level 1 — top-level domain folders of the source tree and existing
  `docs/design/` and `docs/specification/` module folders (kebab-case:
  `DeviceTracking` → `device-tracking`). Cross-cutting docs modules (e.g. `math`,
  `ui`) may span several source folders.
- Deeper levels — existing docs subfolders, then concrete code artifacts
  (module, class, component, config schema).
- **No anchor found** (new or cross-cutting functionality): a blocking question,
  not a guess. Show that nothing matches, propose a kebab-case node, and wait for
  confirmation. Record `code-anchor: none (planned)` and backfill it once the code
  exists.

## Path Mirroring

```text
design:        docs/design/{module}/{node…}/{name}.md
specification: docs/specification/{module}/{node…}/{name}.md
```

- `{module}/{node…}` is identical on both sides, losing no level; `{name}` is
  preserved 1:1. A node mirrors as `{node}/{node}.md` on both sides.
- Link the twins: spec frontmatter `design: design/{module}/{node…}/{name}.md`,
  design pages link the spec in their Related Documents section.
- Not every design page needs a spec yet and vice versa; link only documents that exist.

## Frontmatter

Paths in frontmatter are relative to `docs/`.

| Field | Where | Meaning |
|---|---|---|
| `design` | spec | Path to the design twin |
| `module` | both | Level-1 module |
| `parent` | both | Path to the parent node document |
| `depends-on` | both | Paths to shared mechanics in other subtrees |
| `code-anchor` | design node/leaf | Owning folder, module or class, or `none (planned)` |
| `layer`, `cross-link` | node indexes | Layer and twin page on the other layer |
| `submodule` | nested node indexes | Node name below the module |
| `adr`, `title`, `date`, `superseded-by` | ADR | Number, title, decision date, and the ADR that replaces this one |

## Implementation Plans

Specifications describe technical behavior, contracts, decisions and verification.
Implementation tasks, order, file ownership and progress live in the session plan,
not in the spec. Treat a task list found inside a document as input to check
against code, never as an automatic to-do list.

## Where Does a Doc Belong?

| Question | Location |
|---|---|
| What should the user be able to do? Rules, behavior, acceptance? | `design/{module}/{node…}/{slug}.md` |
| What is shared across features in an area? | `design/…/{node}/{node}.md` |
| How is feature Y built — code map, data model, interface and UI contracts? | `specification/{module}/{node…}/{y}.md` |
| How does a system work across modules (IPC, configuration, logging)? | `architecture/cross-cutting/` |
| Why did we choose this approach? | `architecture/decisions/NNNN-title.md` |
| What is known about the problem, prior art and candidate approaches? | `research/{topic}.md` |
| How do I install, configure, build or deploy the project? | `infrastructure/` |
| How is the project tested? | `testing/` |
| What is this project and how do I start it in one minute? | `README.md` (project root) |

## Format

- Markdown, one topic per file, file and folder names in lowercase kebab-case.
- One `#` title per file; headings in order, without skipping levels.
- Link between documents with relative Markdown links; keep the heading style of
  the document being edited.
- Commands, code and config go in fenced code blocks with a language tag.
- Mermaid only for diagrams — no links inside node labels; reuse the color palette
  from `_templates/module_template.md`.
- Do not create a duplicate page for an existing feature; update the current page
  in place.
