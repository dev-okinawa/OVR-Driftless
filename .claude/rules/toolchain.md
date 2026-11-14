# Toolchain

All code is under `source/`, an npm workspace with two packages: `web` (the
interface) and `core` (the SteamVR connection). Run every command from `source/`.
The project root holds only `README.md`, `CLAUDE.md`, `LICENSE`, `.gitignore`, `docs/` and `.claude/`; put
no code or package files there.

Node 24, npm 11.

## Commands

| Purpose | Command |
|---|---|
| Install dependencies | `npm install` |
| Type check, both packages | `npm run typecheck` |
| Unit tests, both packages (Vitest in `web`, `node --test` in `core`) | `npm test` |
| Production build | `npm run build` |
| Development server, `http://localhost:5173`; starts the core too | `npm run dev` |
| Development server with the core on a fake SteamVR, no VR hardware | `npm run dev:fake` |
| The core alone, `ws://127.0.0.1:47115` | `npm run core` |
| The core alone on a fake SteamVR | `npm run core:fake` |
| SteamVR pose probe; needs SteamVR running | `npm run probe` |

The core is TypeScript that Node runs directly, without a build: erasable syntax
only (no enums, no parameter properties), imports with the `.ts` extension.

Add a dependency to one package with `npm install <name> -w web` or `-w core`,
never at the workspace root.

The design kit (ADR 0002) is vendored in `source/vendor/` as a tarball. npm does
not read the design workspace's UNC path, so to update it copy the kit's
`package.json` (without `scripts` and `devDependencies`), `custom-elements.json`,
`dist/` and `src/tokens/tokens.css` to a local folder, run
`npm pack --ignore-scripts --pack-destination <source>/vendor` there, then
`npm install ./vendor/ai-designer-ui-<version>.tgz -w web`. Build the kit in the
design workspace first (`npm run build:kit` in its `design/`).

## Done Means

A change to `source/web/` is not done until type check, unit tests and the
production build all pass; a change to `source/core/` until its type check and
unit tests pass. Read the output for errors and for new warnings in
touched files.

The development server keeps running until stopped; start it in the background
and stop it when the check is finished.
