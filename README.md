# OpenCode Computer

> OpenCode Computer is an independent project. It is not built by, maintained by, or affiliated with the OpenCode team.

A persistent, private Railway computer for [OpenCode](https://opencode.ai/).

OpenCode Computer is a runtime for the Agent Computer demo. It combines the pinned OpenCode CLI and server with a durable `/data` volume, a normal Linux development toolchain, and a loopback-only integration seam for a future browser control plane. The Railway service intentionally has no public domain or TCP proxy.

## What works today

- OpenCode `1.17.18`, installed from the official `opencode-ai` package.
- Railway CLI `5.26.0`, GitHub CLI, Git, Node.js, Python, tmux, ripgrep, and common development tools.
- Persistent provider authentication, configuration, sessions, plugins, skills, and projects.
- An authenticated OpenCode server on `127.0.0.1:4096`.
- Railway SSH as an optional direct-access and recovery path.
- A health-only Railway listener and a separate loopback-only `agentd` control listener.

The initial `agentd` reports the native OpenCode server as ready but explicitly reports the Agent Computer Chat, Files, and Terminal bridges as unavailable. Those product channels require their own authenticated transport; this repository does not expose them publicly.

On x86-64, the image deliberately uses OpenCode's official baseline binary so a deployment can move between hosts without inheriting the build machine's AVX2 requirement.

## Persistent layout

```text
/data/
  home/
    .cache/opencode/
    .config/opencode/
    .local/share/opencode/
    .local/state/opencode/
    .railway/
  workspace/
  skills/
  agentd/
    private/
    state/
  control/
  trash/
```

`/data/home/.config/opencode/skills` is a validated link to the friendlier `/data/skills` directory. The whole XDG hierarchy is persisted because OpenCode stores provider credentials, its SQLite database, sessions, logs, snapshots, plugins, and downloaded helpers across those directories.

## Deploy on Railway

[Deploy OpenCode Computer on Railway](https://railway.com/deploy/opencode-computer). The template creates one service and mounts one persistent volume at `/data`. It does not create a public domain.

After deployment, direct access is optional:

```bash
railway ssh --project "$PROJECT_ID" --service opencode-computer
```

Connect a model provider:

```bash
opencode auth login
```

Attach the TUI to the already-running private OpenCode server:

```bash
opencode-computer-attach
```

You can also run a separate interactive OpenCode process in the persistent workspace:

```bash
cd /data/workspace
opencode
```

Provider-specific API keys may be configured as Railway variables. The OpenCode server inherits service variables without requiring the image to prescribe a provider.

## Runtime contract

- `opencode serve` binds only to `127.0.0.1:4096` and uses a generated, volume-persisted Basic-auth credential.
- `$PORT` binds on `0.0.0.0` but serves only `/livez` and `/readyz`.
- `agentd` binds only to `127.0.0.1:43117` and verifies the authenticated OpenCode health endpoint.
- OpenCode autoupdates and session sharing are disabled by default. Version upgrades happen through reviewed image rebuilds.
- The current SQLite-backed data directory assumes one attached volume and one service replica.

The loopback server is the future Chat/session data plane. OpenCode's documented HTTP API and SDK are a better fit for the product UI than ACP, which is a subprocess protocol. Finder-style upload, rename, move, and delete operations still require a separate filesystem bridge.

Do not run `opencode upgrade` inside the computer. Update the pinned version in the Dockerfile and redeploy so the managed server, health checks, and API contract stay on the same reviewed release.

## Local development

```bash
npm ci
npm run check
docker build --tag opencode-computer:dev .
```

The container requires `/data` to be a mounted filesystem and exits instead of silently writing persistent state into the image layer.

## Security model

- The service is private by default; no domain or TCP proxy is created.
- Railway rollout health exposes only `/livez` and `/readyz` on `$PORT`.
- The command-capable OpenCode API is password-protected and loopback-only.
- Railway SSH and OpenCode run as the unprivileged `computer` user.
- `agentd` runs as a separate unprivileged user and cannot traverse the computer user's private home.
- Daemon source and image defaults are root-owned and read-only to both runtime users.
- The computer user has passwordless access only to two fixed boot wrappers.
- No Railway, GitHub, OpenCode provider, or SSH private credential is baked into the image.

OpenCode is an agent runtime, not a security sandbox. Code and tools approved to run through OpenCode receive the `computer` user's access to the workspace and service environment. Future browser connections must terminate in an authenticated bridge rather than exposing the native server.

## Upstream and licensing

OpenCode is developed in [anomalyco/opencode](https://github.com/anomalyco/opencode) and distributed under the MIT License. This repository's own code is also MIT-licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [licenses/OpenCode.txt](licenses/OpenCode.txt).
