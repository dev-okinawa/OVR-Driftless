# Security Policy

## Supported Versions

The project is in early development and has no stable release. Security fixes go
to the `main` branch only.

## Reporting a Vulnerability

Do not open a public issue for a vulnerability. Report it privately through
GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**, or go to
<https://github.com/dev-okinawa/OVR-Driftless/security/advisories/new>.

Include what is affected, how to reproduce it and what an attacker gains. You
will get a reply in the advisory thread.

## Scope

- The core serves device poses over a WebSocket bound to `127.0.0.1`. Anything
  that lets another machine reach it, or lets a web page other than the interface
  drive it, is in scope.
- The interface opens recording files chosen by the user. A crafted recording
  that does more than fail to load is in scope.
