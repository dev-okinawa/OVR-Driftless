# GitHub Repository

How the repository at <https://github.com/dev-okinawa/OVR-Driftless> is set up:
continuous integration, community files and how they are kept.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull
request. One job on `windows-latest`, from `source/`:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

These are the checks a change must pass locally
(`.claude/rules/toolchain.md`, Done Means). The job runs on Windows because the
core targets it: it loads `openvr_api.dll` and reads `%LOCALAPPDATA%`. No step
needs SteamVR or VR hardware; the tests use the fake SteamVR.

`npm ci` installs the design kit from `source/vendor/`, so the tarball there must
be committed (ADR 0002).

## Community Files

All of them live in `.github/`, so the project root stays as
`.claude/rules/toolchain.md` describes it.

| File | Purpose |
|---|---|
| `CONTRIBUTING.md` | Setup, the checks, conventions, how to report hardware results |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.0 |
| `SECURITY.md` | Private vulnerability reporting through GitHub advisories |
| `PULL_REQUEST_TEMPLATE.md` | Checklist of a pull request |
| `ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml` | Issue forms |

`CONTRIBUTING.md` repeats commands and conventions from `.claude/rules/`; when a
rule there changes, change it here too.
