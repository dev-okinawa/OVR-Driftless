---
adr: 0002
title: Design kit as web components in the interface
date: 2026-11-14
superseded-by: —
---

# 0002 — Design kit as web components in the interface

## Context

The interface design is made in a separate design workspace, ai-designer
(`\\wsl.localhost\Ubuntu-22.04\home\user\dev\ai-designer`). It holds the UI
contracts of the scene and of the calibration panel (`docs/ui/scene.md`,
`docs/ui/calibration.md`), the brand (`docs/design/brand.md`) and a UI kit of
about 40 components and one layout (Stage), built with Lit as standard web
components and checked in Storybook. The kit is published as an ESM library with
types, design tokens (`tokens.css`) and a Custom Elements Manifest. Its screens,
demo data and the SVG spatial view are a prototype and are not part of the
interface.

The interface (ADR 0001) is React with CSS modules. Rewriting the kit in React
would duplicate it, and every change the designer makes would have to be carried
over by hand.

## Decision

- The interface uses the kit's elements (`ui-*`) directly in React. React 19 sets
  props as DOM properties and binds `on` + event name props as listeners for that
  exact name (`onui-change`).
- The built kit is vendored as an npm tarball, `source/vendor/ai-designer-ui-<version>.tgz`,
  and installed into the `web` package. The tarball carries `dist/`,
  `src/tokens/tokens.css`, `custom-elements.json` and a `package.json` without the
  design workspace's scripts and development dependencies.
- `source/web/src/kit/` registers the elements, loads the fonts and declares the
  JSX types of the elements from the tag map the kit publishes.
- The kit's tokens are the interface's tokens. `styles/tokens.css` imports them
  and holds only page-wide rules. CSS modules of the interface arrange kit
  elements and style what the kit does not cover, using `--ui-*` tokens.
- React composes the screens from kit elements, following the UI contracts. The
  3D scene stays on three.js and follows the brand; device marks in the scene are
  the kit's `ui-device-mark` elements placed by the CSS2D renderer.

## Alternatives Considered

| Option | Why rejected |
|--------|--------------|
| Port the kit to React components and CSS modules | Duplicates about 14 500 lines; every design change is carried over by hand and drifts from the checked kit |
| Depend on the design workspace by path (`file:` to the WSL folder) | Not reproducible on another machine; npm does not read UNC paths |
| Use the kit's screens and its SVG spatial view | They run on the prototype's deterministic demo session, not on `SessionStore`; the scene, recording and skeleton already work on three.js |

## Affected Systems

| System | Impact |
|--------|--------|
| `source/web/` | New dependencies `@ai-designer/ui` (vendored), `lit` through it, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` |
| Interface code | Panels and the application shell are rebuilt from kit elements; own CSS shrinks to arrangement |
| Coding standards | Styling rule: kit elements carry their own styles; CSS modules use `--ui-*` tokens |

## Consequences

**Positive:**

- The interface looks and behaves like the reviewed design, including focus,
  keyboard and reduced-motion behavior the kit already checks.
- A design change reaches the interface by replacing the tarball.

**Negative / trade-offs:**

- Two component models in one page: React for composition, Lit inside the kit.
- Kit events are untyped in React except where `kit/jsx.d.ts` declares their
  detail.
- The vendored tarball keeps the version `0.1.0` the kit declares; an update
  replaces the file and reinstalls it.

## Follow-up

- The kit's `package.json` runs `playwright install chromium` on install; the kit
  should drop its workspace scripts from the published package.

## References

- [Architecture index](../architecture.md)
- [ADR 0001](./0001-web-interface-node-core.md)
- [Scene specification](../../specification/scene/scene.md)
