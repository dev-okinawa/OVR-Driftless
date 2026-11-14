# Coding Standards

## Simplicity First

- Write the minimum code that solves the requested problem. Add no speculative
  features, configuration switches or extension points.
- Keep single-use logic direct; do not introduce an abstraction solely for possible
  future reuse. Follow established boundaries that the current task actually needs.
- Handle real input and failure cases. Avoid defensive branches for states already
  ruled out by validated contracts.
- Before finishing, ask whether a senior engineer would find the solution
  overcomplicated. If a substantially smaller, clearer implementation preserves
  the required behavior, simplify it; line count alone is not the goal.

## Surgical Changes

- Every changed line must support the user's request or be a necessary consequence
  of it. Preserve unrelated working changes.
- Match the surrounding style and patterns in touched code. Keep adjacent code,
  comments and formatting outside the change unless the task requires them.
- Refactor only when requested or necessary to deliver the requested behavior.
- Remove includes, variables and functions that this change makes unused. Verify
  their callers before removal. Mention relevant pre-existing dead code as a
  separate observation; remove it only when that cleanup is requested.

## Design Principles

Project conventions and the constraints of the VR runtime and device SDKs take
priority over textbook purity.

- **Single responsibility** — a module, class or function changes for one reason.
  Split it when it starts owning unrelated state, input and UI.
- **Open/closed** — extend through configuration, interfaces or new components
  before modifying stable shared code.
- **Liskov substitution** — a subtype preserves the base contract for existing
  callers.
- **Interface segregation** — keep interfaces focused; no interface that forces
  implementers to stub unrelated behavior.
- **Dependency inversion** — depend on interfaces, not on concrete classes of
  other modules.
- **Composition over inheritance** — inherit only for true type relationships and
  where the runtime or SDK requires it.
- **DRY without over-abstraction** — remove duplicated rules and validation; do
  not merge code paths that represent different concepts just because they look
  alike.

## TypeScript

- Strict mode; no `any`, no non-null assertion where a check is possible, no
  `@ts-ignore`.
- Named exports only. One main export per file; the file name matches it in
  camelCase, or PascalCase for a React component.
- Data crossing module boundaries is `readonly`. Functions in `math/` are pure:
  they return new values and never change their arguments.
- React components are functions. Data that changes many times a second (frames,
  poses) never goes through React state; it goes from the store to its consumer
  directly.
- Interface elements come from the design kit (`ui-*`, ADR 0002) and carry
  their own styles. CSS modules next to a component arrange them and style what
  the kit does not cover, with the kit's `--ui-*` tokens; components define no
  colors of their own.
- Tests sit next to the code as `*.test.ts` and cover the math and the logic,
  not the rendering.

## Code Quality

- Comments say why, not what. No `TODO` without an owner or a ticket.
- No leftover debug output or trace logging at warning level.
- No commented-out code unless a comment explains why it stays.
- Math that converts between coordinate spaces names the source and target space
  and the units in identifiers or comments.
