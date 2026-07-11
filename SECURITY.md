# Security

## Reporting a vulnerability

Please report security issues privately to `m@mahmoudw.com`. Do not open a public issue for a vulnerability that could expose credentials, files, or control-plane access.

## Current boundary

- The Railway service has no public domain or TCP proxy.
- The listener on `$PORT` serves health state only.
- The OpenCode server uses a generated Basic-auth credential and binds to `127.0.0.1:4096`.
- The `agentd` control listener binds to `127.0.0.1:43117`.
- `computer` and `agentd` use separate Unix identities.
- OpenCode provider credentials stay in `/data/home/.local/share/opencode/auth.json`, beneath a computer-private home directory.
- Daemon source and image defaults are root-owned and read-only to both identities.
- Agent Computer Chat, Files, and Terminal bridges remain disabled until an authenticated product transport exists.
- No model-provider, GitHub, Railway, or SSH private credential is built into the image.

HTTP Basic authentication protects the loopback OpenCode API from accidental unauthenticated access but is not the end-user or device authentication layer. Never create a Railway domain or TCP proxy for port `4096`. Future control-plane connections must terminate in a mutually authenticated bridge.

## Runtime identities

- Railway SSH, OpenCode, and agent-executed commands use the unprivileged `computer` identity.
- `agentd` uses a separate unprivileged identity and reads only shared workspace paths plus the loopback health credential.
- The computer user's only passwordless root commands are the fixed bootstrap and daemon-run wrappers. They accept no arguments and do not execute user-provided content as root.

OpenCode's permission system is not an operating-system sandbox. The Railway service/container is the isolation boundary for this template.
